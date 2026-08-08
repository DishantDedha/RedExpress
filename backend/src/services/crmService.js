import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { BLOOD_GROUPS, bloodGroupLabel, bloodGroupShort } from './matching.js';
import { donorSearchView } from './donorSearchService.js';
import { findCandidates, matchView } from './matchingEngine.js';
import { isExpired, requestView } from './requestService.js';
import { callSummariesFor, listCalls } from './callLogService.js';
import { listAuditForUser } from './auditService.js';

/**
 * The read side of the CRM.
 *
 * Staff are the only role that sees whole people rather than trimmed cards: they are on
 * the phone to a donor, so they get the address, the coordinates, the status and the call
 * history. Every function here is behind requireRole('STAFF', 'ADMIN') at the router — the
 * views below deliberately do no further redaction, and must not be reused for app users.
 */

const STAFF_VIEWER = { role: 'STAFF' };

/** Case-insensitive exact match, same convention as donor search. */
function areaMatch(value) {
  return value ? { equals: value, mode: 'insensitive' } : undefined;
}

function pageBounds({ page = 1, pageSize = env.search.defaultPageSize }) {
  const size = Math.min(Math.max(pageSize, 1), env.search.maxPageSize);
  const current = Math.max(page, 1);
  return { page: current, pageSize: size, skip: (current - 1) * size };
}

// ---------------------------------------------------------------------------
// User search
// ---------------------------------------------------------------------------

/**
 * Turns one search box into a WHERE across name, phone and email.
 *
 * Phone needs three shots at it, because staff type what is in front of them: the number
 * as stored (+919876500001), what a donor reads out (9876500001), and a fragment of it
 * from a call log. So the raw text, the digits, and the E.164 normalisation are all tried.
 */
function freeTextWhere(q) {
  const text = q.trim();
  if (!text) return null;

  const clauses = [
    { name: { contains: text, mode: 'insensitive' } },
    { email: { contains: text, mode: 'insensitive' } },
    { phone: { contains: text } },
  ];

  const digits = text.replace(/\D/g, '');
  // Three digits would match half the database; a partial number worth searching starts
  // around four.
  if (digits.length >= 4) {
    clauses.push({ phone: { contains: digits } });
    try {
      clauses.push({ phone: normalizePhone(digits) });
    } catch {
      // Not a whole number yet — the `contains` clauses above still cover the fragment.
    }
  }

  return { OR: clauses };
}

/**
 * A donor's address lives on DonorProfile; a receiver registered through the quick form
 * has theirs on User. A staff member searching "Cuttack" means either.
 */
function areaWhere(field, value) {
  const match = areaMatch(value);
  if (!match) return null;
  return { OR: [{ [field]: match }, { donorProfile: { [field]: match } }] };
}

const USER_INCLUDE = { donorProfile: true };

/** One row of the CRM people table. */
export function crmUserRow(user, summary) {
  const profile = user.donorProfile ?? null;

  return {
    id: user.id,
    name: user.name || null,
    phone: user.phone,
    email: user.email,
    role: user.role,
    status: user.status,
    isPhoneVerified: user.isPhoneVerified,
    createdAt: user.createdAt,

    // Flattened for the table; the full profile is on the detail endpoint.
    bloodGroup: profile?.bloodGroup ?? null,
    bloodGroupLabel: profile ? bloodGroupLabel(profile.bloodGroup) : null,
    bloodGroupShort: profile ? bloodGroupShort(profile.bloodGroup) : null,
    isAvailable: profile?.isAvailable ?? null,
    lastDonationDate: profile?.lastDonationDate ?? null,

    state: profile?.state ?? user.state ?? null,
    district: profile?.district ?? user.district ?? null,
    city: profile?.city ?? user.city ?? null,

    // A donor whose registration never finished has a User but no DonorProfile. Staff need
    // to see that rather than an empty row they cannot explain.
    profileComplete: user.role === 'DONOR' ? Boolean(profile) : Boolean(user.name),

    lastCall: summary?.lastCall ?? null,
    callCount: summary?.callCount ?? 0,
  };
}

/**
 * GET /crm/users/search — the people finder.
 *
 * Everyone is searchable, including staff, because "who is this number" is a question
 * about the whole database and answering it partially is worse than not answering.
 */
export async function searchUsers(params = {}) {
  const and = [
    params.q ? freeTextWhere(params.q) : null,
    params.role ? { role: params.role } : null,
    params.status ? { status: params.status } : null,
    params.bloodGroup ? { donorProfile: { bloodGroup: params.bloodGroup } } : null,
    areaWhere('state', params.state),
    areaWhere('district', params.district),
    areaWhere('city', params.city),
  ].filter(Boolean);

  const where = and.length ? { AND: and } : {};
  const { page, pageSize, skip } = pageBounds(params);

  const [total, users] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      include: USER_INCLUDE,
      // Alphabetical is what a person scanning a list expects; accounts created by OTP but
      // never registered have an empty name and surface first, which is useful.
      orderBy: [{ name: 'asc' }, { createdAt: 'desc' }],
      skip,
      take: pageSize,
    }),
  ]);

  const summaries = await callSummariesFor(users.map((user) => user.id));

  return {
    results: users.map((user) => crmUserRow(user, summaries.get(user.id))),
    page,
    pageSize,
    total,
    hasMore: skip + users.length < total,
    filters: {
      q: params.q ?? null,
      role: params.role ?? null,
      status: params.status ?? null,
      bloodGroup: params.bloodGroup ?? null,
      state: params.state ?? null,
      district: params.district ?? null,
      city: params.city ?? null,
    },
  };
}

// ---------------------------------------------------------------------------
// User detail
// ---------------------------------------------------------------------------

/**
 * Everything about one person on one screen: profile, the requests they posted, the
 * requests they were asked to help with, every call staff made, and the audit trail of
 * status changes. This is the page a staff member reads before deciding whether a donor
 * has really gone unreachable.
 */
export async function getUserDetail(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: USER_INCLUDE });
  if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'That person is no longer in Red Express.');

  const [summaries, calls, audit, requests, matches] = await Promise.all([
    callSummariesFor([user.id]),
    listCalls({ donorUserId: user.id, take: 50 }),
    listAuditForUser(user.id),
    prisma.bloodRequest.findMany({
      where: { requesterId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { requester: { select: { name: true } }, _count: { select: { matches: true } } },
    }),
    prisma.requestMatch.findMany({
      where: { donorUserId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: { request: { include: { requester: { select: { name: true } } } } },
    }),
  ]);

  return {
    user: crmUserRow(user, summaries.get(user.id)),
    // The unredacted profile — address, PIN code and coordinates included. Staff only.
    donorProfile: user.donorProfile
      ? donorSearchView({ ...user.donorProfile, user, distanceKm: null }, STAFF_VIEWER)
      : null,
    location: user.donorProfile
      ? { latitude: user.donorProfile.latitude, longitude: user.donorProfile.longitude }
      : { latitude: user.latitude, longitude: user.longitude },
    calls,
    audit,
    requestsPosted: requests.map((request) => requestView(request, { includeContact: true })),
    // "Donation history" as the system actually knows it: who we asked, and what they said.
    // lastDonationDate on the profile is the donor's own account of the last real donation.
    matches: matches.map((match) => ({
      id: match.id,
      requestId: match.requestId,
      distanceKm: match.distanceKm,
      response: match.response,
      respondedAt: match.respondedAt,
      notifiedAt: match.notifiedAt,
      createdAt: match.createdAt,
      request: requestView(match.request, { includeContact: true }),
    })),
    counts: {
      calls: summaries.get(user.id)?.callCount ?? 0,
      requestsPosted: requests.length,
      matches: matches.length,
      accepted: matches.filter((match) => match.response === 'ACCEPTED').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Nearby donors for a request — the calling worklist
// ---------------------------------------------------------------------------

const MATCH_DONOR_INCLUDE = {
  donor: { select: { id: true, name: true, phone: true, status: true, donorProfile: true } },
};

/**
 * GET /crm/donors/nearby?requestId= — who to ring, nearest first.
 *
 * Normally these are the RequestMatch rows the engine wrote when the request was posted:
 * the same people who got the push, in the same order, with the distance frozen at match
 * time so the worklist does not reshuffle under a staff member working down it.
 *
 * When a request has no matches — nobody was in range, or it was created before matching
 * existed — the engine is re-run in preview mode instead of returning an empty page. That
 * writes nothing and notifies nobody; it is the answer to "is there really nobody?", and
 * `source: 'preview'` says so plainly rather than passing guesses off as history.
 */
export async function nearbyDonorsForRequest(requestId) {
  const request = await prisma.bloodRequest.findUnique({
    where: { id: requestId },
    include: { requester: { select: { name: true } }, _count: { select: { matches: true } } },
  });
  if (!request) throw ApiError.notFound('REQUEST_NOT_FOUND', 'That blood request no longer exists.');

  const matches = await prisma.requestMatch.findMany({
    where: { requestId },
    // NULLs sort last on ASC in Postgres, so area-matched donors with no measurable
    // distance land at the bottom of the call list rather than the top.
    orderBy: [{ distanceKm: 'asc' }, { createdAt: 'asc' }],
    include: MATCH_DONOR_INCLUDE,
  });

  const preview = matches.length ? null : await findCandidates(request);

  const rows = matches.length
    ? matches.map((match) => matchView(match, STAFF_VIEWER))
    : preview.candidates.map((candidate) => ({
        id: null,
        requestId,
        donorUserId: candidate.userId,
        distanceKm: candidate.distanceKm,
        response: null,
        respondedAt: null,
        notifiedAt: null,
        createdAt: null,
        donor: donorSearchView(candidate, STAFF_VIEWER),
      }));

  const summaries = await callSummariesFor(rows.map((row) => row.donorUserId));

  return {
    request: requestView(request, { includeContact: true }),
    source: matches.length ? 'matches' : 'preview',
    isExpired: isExpired(request),
    donors: rows.map((row) => ({
      ...row,
      lastCall: summaries.get(row.donorUserId)?.lastCall ?? null,
      callCount: summaries.get(row.donorUserId)?.callCount ?? 0,
    })),
    counts: rows.reduce((acc, row) => ({ ...acc, [row.response ?? 'PENDING']: (acc[row.response ?? 'PENDING'] ?? 0) + 1 }), {
      PENDING: 0,
      ACCEPTED: 0,
      DECLINED: 0,
    }),
    ...(preview
      ? {
          matching: {
            strategy: preview.strategy,
            radiusKm: preview.radiusKm,
            steps: preview.steps,
            reachedMinimum: preview.reachedMinimum,
            fellBackToArea: preview.fellBackToArea,
          },
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

/**
 * Midnight this morning in the server's timezone.
 *
 * "Matches today" is a shift metric — staff want to know what has happened since they came
 * in — so the server's local day is the right boundary, not UTC. Set TZ on the host to the
 * one the operations team works in (see docs/deploy.md, Phase 15).
 */
export function startOfToday(now = new Date()) {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
}

/** groupBy rows -> plain { key: count }, with every expected key present at zero. */
function tally(rows, key, keys) {
  const counts = Object.fromEntries(keys.map((value) => [value, 0]));
  for (const row of rows) counts[row[key]] = row._count._all;
  return counts;
}

/**
 * GET /crm/stats — the dashboard numbers.
 *
 * One transaction so the cards on screen all describe the same instant; a donor marked
 * dead between two of these queries would otherwise be counted in both ACTIVE and DEAD.
 */
export async function crmStats() {
  const since = startOfToday();
  const now = new Date();

  const [
    groupTotals,
    groupActive,
    groupAvailable,
    donorStatus,
    roleTotals,
    requestStatus,
    openNow,
    openExpired,
    openCritical,
    matchesToday,
    acceptedToday,
    callsToday,
    markedDeadToday,
  ] = await prisma.$transaction([
    prisma.donorProfile.groupBy({ by: ['bloodGroup'], _count: { _all: true } }),
    prisma.donorProfile.groupBy({ by: ['bloodGroup'], where: { user: { status: 'ACTIVE' } }, _count: { _all: true } }),
    prisma.donorProfile.groupBy({
      by: ['bloodGroup'],
      where: { user: { status: 'ACTIVE' }, isAvailable: true },
      _count: { _all: true },
    }),
    prisma.user.groupBy({ by: ['status'], where: { role: 'DONOR' }, _count: { _all: true } }),
    prisma.user.groupBy({ by: ['role'], _count: { _all: true } }),
    prisma.bloodRequest.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.bloodRequest.count({ where: { status: 'OPEN', expiresAt: { gt: now } } }),
    // Still OPEN in the column but past its expiry — requestView reports these as EXPIRED,
    // and staff should see the discrepancy rather than a number that disagrees with the list.
    prisma.bloodRequest.count({ where: { status: 'OPEN', expiresAt: { lte: now } } }),
    prisma.bloodRequest.count({ where: { status: 'OPEN', expiresAt: { gt: now }, urgency: 'CRITICAL' } }),
    prisma.requestMatch.count({ where: { createdAt: { gte: since } } }),
    prisma.requestMatch.count({ where: { response: 'ACCEPTED', respondedAt: { gte: since } } }),
    prisma.callLog.count({ where: { createdAt: { gte: since } } }),
    prisma.callLog.count({ where: { outcome: 'MARKED_DEAD', createdAt: { gte: since } } }),
  ]);

  const totals = tally(groupTotals, 'bloodGroup', BLOOD_GROUPS);
  const active = tally(groupActive, 'bloodGroup', BLOOD_GROUPS);
  const available = tally(groupAvailable, 'bloodGroup', BLOOD_GROUPS);

  return {
    generatedAt: now,
    since,
    donors: {
      byBloodGroup: BLOOD_GROUPS.map((group) => ({
        bloodGroup: group,
        label: bloodGroupLabel(group),
        short: bloodGroupShort(group),
        total: totals[group],
        active: active[group],
        // The number that actually matters: active AND switched on, i.e. how many people
        // this blood group could reach right now.
        available: available[group],
      })),
      byStatus: tally(donorStatus, 'status', ['ACTIVE', 'DEAD', 'BLOCKED']),
      total: Object.values(totals).reduce((sum, count) => sum + count, 0),
    },
    users: { byRole: tally(roleTotals, 'role', ['DONOR', 'RECEIVER', 'STAFF', 'ADMIN']) },
    requests: {
      byStatus: tally(requestStatus, 'status', ['OPEN', 'FULFILLED', 'CANCELLED', 'EXPIRED']),
      open: openNow,
      openCritical,
      // Open rows whose expiry has passed. A steady climb here means nothing is closing
      // them out.
      staleOpen: openExpired,
    },
    today: { matches: matchesToday, accepted: acceptedToday, calls: callsToday, markedDead: markedDeadToday },
  };
}
