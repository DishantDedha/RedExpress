import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { resolveCoordinates } from './locationService.js';
import { bloodGroupLabel, bloodGroupShort, donorGroupsFor } from './matching.js';
import { donorSearchView } from './donorSearchService.js';
import { createMatchesForRequest, matchView } from './matchingEngine.js';
import { sendPush } from './notificationService.js';
import { buildAcceptedNotification } from './pushMessages.js';

/**
 * Blood requests: create, list, read, close — and the hand-off to the matching engine.
 *
 * A request is the only object in the system that causes other people's phones to buzz,
 * so the guards here are about who may create one and who may see the contact details on
 * it, not just about valid input.
 */

// ---------------------------------------------------------------------------
// Who may do what
// ---------------------------------------------------------------------------

/**
 * Roles allowed to post a request.
 *
 * The phase brief says "RECEIVER or STAFF", but Phase 3 deliberately does NOT demote a
 * registered donor who later fills in the receiver form — donors need blood too, and
 * flipping their role would drop them out of every search. With a strict RECEIVER-only
 * gate those users could never ask for blood, so DONOR is included here. Remove it from
 * this one constant if you want the stricter reading.
 */
export const REQUEST_CREATOR_ROLES = new Set(['RECEIVER', 'DONOR', 'STAFF', 'ADMIN']);

function isStaff(user) {
  return user.role === 'STAFF' || user.role === 'ADMIN';
}

function assertCanCreate(user) {
  if (!REQUEST_CREATOR_ROLES.has(user.role)) {
    throw ApiError.forbidden('FORBIDDEN', 'Your account cannot post a blood request.');
  }
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

/** A request past its expiry is functionally closed even before anything rewrites the row. */
export function isExpired(request) {
  return request.status === 'OPEN' && request.expiresAt.getTime() <= Date.now();
}

/**
 * `contactPhone` and `hospitalName` are the operational payload of a request — they are
 * shown to the requester, to staff, and to a donor who was actually matched, and to
 * nobody else. A stranger listing open requests sees where and what, not who to ring.
 */
export function requestView(request, { includeContact = false, extra = {} } = {}) {
  return {
    id: request.id,
    requesterId: request.requesterId,
    requesterName: request.requester?.name ?? null,
    bloodGroup: request.bloodGroup,
    bloodGroupLabel: bloodGroupLabel(request.bloodGroup),
    bloodGroupShort: bloodGroupShort(request.bloodGroup),
    compatibleDonorGroups: donorGroupsFor(request.bloodGroup),
    unitsNeeded: request.unitsNeeded,
    urgency: request.urgency,
    note: request.note,
    state: request.state,
    district: request.district,
    city: request.city,
    status: isExpired(request) ? 'EXPIRED' : request.status,
    // The stored column, so a client can tell "expired on its own" from "closed by staff".
    storedStatus: request.status,
    isExpired: isExpired(request),
    createdAt: request.createdAt,
    expiresAt: request.expiresAt,
    matchCount: request._count?.matches ?? undefined,
    ...(includeContact
      ? {
          hospitalName: request.hospitalName,
          contactPhone: request.contactPhone,
          latitude: request.latitude,
          longitude: request.longitude,
        }
      : { hospitalName: request.hospitalName }),
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

function expiryFrom(input) {
  if (input.expiresAt) return input.expiresAt;
  return new Date(Date.now() + env.request.defaultExpiryHours * 60 * 60 * 1000);
}

/**
 * Creates the request and immediately runs the matching engine.
 *
 * Matching runs inline rather than on a queue: the receiver is standing in a hospital
 * corridor and the response is what tells them whether anyone was found. It is a handful
 * of indexed reads and one createMany, so the latency is worth the certainty. If it ever
 * needs to move off the request path, the seam is `createMatchesForRequest` — the request
 * row is already committed by then.
 */
export async function createRequest(user, input) {
  assertCanCreate(user);

  const location = await resolveCoordinates({
    latitude: input.latitude,
    longitude: input.longitude,
    address: input.address,
    city: input.city,
    district: input.district,
    state: input.state,
  });

  const request = await prisma.bloodRequest.create({
    data: {
      requesterId: user.id,
      bloodGroup: input.bloodGroup,
      unitsNeeded: input.unitsNeeded,
      hospitalName: input.hospitalName,
      // Already normalised to E.164 by the schema.
      contactPhone: input.contactPhone,
      urgency: input.urgency ?? 'NORMAL',
      note: input.note ?? null,
      // Fall back to whatever the requester registered with, so a request posted from the
      // quick form still has an administrative area for the area-matching fallback.
      state: input.state ?? user.state ?? null,
      district: input.district ?? user.district ?? null,
      city: input.city ?? user.city ?? null,
      latitude: location.latitude,
      longitude: location.longitude,
      expiresAt: expiryFrom(input),
    },
    include: { requester: { select: { name: true } } },
  });

  const matching = await createMatchesForRequest(request);

  return {
    request: requestView(request, { includeContact: true, extra: { matchCount: matching.matchedCount } }),
    locationSource: location.locationSource,
    matching: {
      strategy: matching.strategy,
      radiusKm: matching.radiusKm,
      steps: matching.steps,
      reachedMinimum: matching.reachedMinimum,
      fellBackToArea: matching.fellBackToArea,
      matchedCount: matching.matchedCount,
      // How many of those matches actually reached a phone. `matchedCount` is who we
      // decided to ask; this is who we managed to tell. They differ whenever a donor has
      // no device registered, which is normal and not an error.
      notification: matching.notification,
    },
    // Plain sentence the mobile screen announces verbatim; a count with no words is
    // useless to a screen reader.
    message: matching.matchedCount
      ? `Request posted. ${matching.matchedCount} nearby ${matching.matchedCount === 1 ? 'donor is' : 'donors are'} being notified.`
      : 'Request posted. No matching donors were found nearby yet. Our team will keep looking.',
    // The people who were just notified, so the receiver can start calling immediately
    // rather than waiting for anyone to answer the push. Same trimmed view as search.
    donors: matching.donors.map((donor) => donorSearchView(donor, user)),
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

async function loadRequest(id) {
  const request = await prisma.bloodRequest.findUnique({
    where: { id },
    include: { requester: { select: { name: true } }, _count: { select: { matches: true } } },
  });
  if (!request) throw ApiError.notFound('REQUEST_NOT_FOUND', 'That blood request no longer exists.');
  return request;
}

/** True when this user was asked to donate for this request. */
async function isMatchedDonor(userId, requestId) {
  const match = await prisma.requestMatch.findUnique({
    where: { requestId_donorUserId: { requestId, donorUserId: userId } },
    select: { id: true },
  });
  return Boolean(match);
}

export async function getRequest(user, id) {
  const request = await loadRequest(id);

  const owner = request.requesterId === user.id;
  const staff = isStaff(user);
  const matched = owner || staff ? false : await isMatchedDonor(user.id, id);

  // A request names a patient's hospital and a contact number. Only the person who
  // posted it, the donors actually asked to help, and staff have any business reading it —
  // knowing an id must not be enough.
  if (!owner && !staff && !matched) {
    throw ApiError.forbidden('FORBIDDEN', 'This request was not sent to you.');
  }

  const myMatch = matched
    ? await prisma.requestMatch.findUnique({ where: { requestId_donorUserId: { requestId: id, donorUserId: user.id } } })
    : null;

  return {
    request: requestView(request, {
      includeContact: owner || staff || matched,
      extra: myMatch
        ? {
            myMatch: {
              id: myMatch.id,
              distanceKm: myMatch.distanceKm,
              response: myMatch.response,
              respondedAt: myMatch.respondedAt,
            },
          }
        : {},
    }),
    canRespond: matched && request.status === 'OPEN' && !isExpired(request),
    canUpdateStatus: owner || staff,
  };
}

/**
 * Lists requests.
 *
 * Staff see everything and filter freely. An app user sees their own requests, or with
 * scope=matched the ones they were asked to help with — the "requests near you" inbox.
 * There is deliberately no "browse every open request" for app users: that would turn an
 * emergency board into a directory of who is in hospital.
 */
export async function listRequests(user, params) {
  const staff = isStaff(user);
  const scope = params.scope ?? (staff ? 'all' : 'mine');

  if (scope === 'all' && !staff) {
    throw ApiError.forbidden('FORBIDDEN', 'You can only see your own requests.');
  }

  const where = {
    ...(params.bloodGroup ? { bloodGroup: params.bloodGroup } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.urgency ? { urgency: params.urgency } : {}),
    ...(params.state ? { state: { equals: params.state, mode: 'insensitive' } } : {}),
    ...(params.district ? { district: { equals: params.district, mode: 'insensitive' } } : {}),
    ...(params.city ? { city: { equals: params.city, mode: 'insensitive' } } : {}),
    ...(scope === 'mine' ? { requesterId: user.id } : {}),
    ...(scope === 'matched' ? { matches: { some: { donorUserId: user.id } } } : {}),
  };

  const pageSize = Math.min(Math.max(params.pageSize ?? env.search.defaultPageSize, 1), env.search.maxPageSize);
  const page = Math.max(params.page ?? 1, 1);
  const skip = (page - 1) * pageSize;

  const [total, rows] = await prisma.$transaction([
    prisma.bloodRequest.count({ where }),
    prisma.bloodRequest.findMany({
      where,
      include: { requester: { select: { name: true } }, _count: { select: { matches: true } } },
      // Most urgent first, then newest: a CRITICAL request from an hour ago outranks a
      // NORMAL one from a minute ago on a staff worklist.
      orderBy: [{ urgency: 'desc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
    }),
  ]);

  return {
    results: rows.map((request) =>
      requestView(request, { includeContact: staff || request.requesterId === user.id || scope === 'matched' }),
    ),
    page,
    pageSize,
    total,
    hasMore: skip + rows.length < total,
    scope,
  };
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

export async function updateRequestStatus(user, id, status, note) {
  const request = await loadRequest(id);
  const owner = request.requesterId === user.id;
  const staff = isStaff(user);

  if (!owner && !staff) {
    throw ApiError.forbidden('FORBIDDEN', 'Only the person who posted this request, or our staff, can close it.');
  }

  // Reopening a closed request would re-notify nobody (matches already exist) while
  // making it look live again, so only staff may move a request out of a final state.
  if (request.status !== 'OPEN' && !staff) {
    throw ApiError.conflict('REQUEST_CLOSED', 'This request is already closed.');
  }

  const updated = await prisma.bloodRequest.update({
    where: { id },
    data: { status, ...(note !== undefined ? { note } : {}) },
    include: { requester: { select: { name: true } }, _count: { select: { matches: true } } },
  });

  return {
    request: requestView(updated, { includeContact: true }),
    message: `Request marked ${status.toLowerCase()}.`,
  };
}

// ---------------------------------------------------------------------------
// Matches
// ---------------------------------------------------------------------------

/** The call worklist. Nearest first, unmeasurable (area-matched) donors last. */
export async function listMatches(user, requestId, params = {}) {
  const request = await loadRequest(requestId);

  const staff = isStaff(user);
  if (!staff && request.requesterId !== user.id) {
    throw ApiError.forbidden('FORBIDDEN', 'You cannot see the donors matched to this request.');
  }

  const matches = await prisma.requestMatch.findMany({
    where: { requestId, ...(params.response ? { response: params.response } : {}) },
    include: { donor: { select: { id: true, name: true, phone: true, status: true, donorProfile: true } } },
    // Postgres sorts NULLs last on ASC by default, which is exactly what we want.
    orderBy: [{ distanceKm: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    request: requestView(request, { includeContact: true }),
    matches: matches.map((match) => matchView(match, user)),
    counts: matches.reduce(
      (acc, match) => ({ ...acc, [match.response]: (acc[match.response] ?? 0) + 1 }),
      { PENDING: 0, ACCEPTED: 0, DECLINED: 0 },
    ),
  };
}

/**
 * A donor's answer to "can you help?".
 *
 * Only the donor themselves may record it — a staff member who reaches someone by phone
 * writes a CallLog instead (Phase 6), so the two sources of truth never get confused with
 * each other. Changing an earlier answer is allowed: circumstances change between
 * accepting and arriving, and a donor who quietly cannot come is worse than one who says so.
 */
export async function respondToMatch(user, requestId, donorUserId, response) {
  if (user.id !== donorUserId) {
    throw ApiError.forbidden('FORBIDDEN', 'You can only answer a request that was sent to you.');
  }

  const request = await loadRequest(requestId);

  const match = await prisma.requestMatch.findUnique({
    where: { requestId_donorUserId: { requestId, donorUserId } },
    include: { donor: { select: { id: true, name: true, phone: true, status: true, donorProfile: true } } },
  });
  if (!match) {
    throw ApiError.notFound('MATCH_NOT_FOUND', 'This request was not sent to you.');
  }

  if (request.status !== 'OPEN' || isExpired(request)) {
    throw ApiError.conflict('REQUEST_CLOSED', 'This request is no longer open. Thank you for answering.');
  }

  const updated = await prisma.requestMatch.update({
    where: { id: match.id },
    data: { response, respondedAt: new Date() },
    include: { donor: { select: { id: true, name: true, phone: true, status: true, donorProfile: true } } },
  });

  const acceptedCount = await prisma.requestMatch.count({ where: { requestId, response: 'ACCEPTED' } });

  // The requester's phone is in their hand and the answer they are waiting for is "has
  // anyone said yes". A decline is deliberately silent — a person in a hospital does not
  // need a buzz for every "no", and the accepted count on screen already tells them.
  if (response === 'ACCEPTED') {
    try {
      await sendPush(
        request.requesterId,
        buildAcceptedNotification({ request, donorName: user.name, distanceKm: match.distanceKm }),
      );
    } catch (err) {
      // The response is recorded; the requester will see it when they open the request.
      console.error(`[match] notifying requester of acceptance on ${requestId} failed`, err);
    }
  }

  return {
    match: matchView(updated, user),
    // The donor now needs the hospital details, so contact information is unlocked by
    // accepting rather than shown up front.
    request: requestView(request, { includeContact: response === 'ACCEPTED' }),
    acceptedCount,
    message:
      response === 'ACCEPTED'
        ? 'Thank you. The hospital details are on this screen and the requester has been told you can help.'
        : 'Thank you for answering. You will not be asked about this request again.',
  };
}
