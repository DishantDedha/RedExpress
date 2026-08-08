import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { boundingBox, coarseKm, hasCoordinates } from './geo.js';
import { expandingRadiusSearch, rankByDistance, withinRadius } from './matching.js';
import { donorBaseWhere, donorSearchView, withBoundingBox } from './donorSearchService.js';
import { notifyMatchedDonors } from './notificationService.js';

/**
 * The matching engine: given a blood request, decide which donors to ask.
 *
 * The rules live in matching.js (pure, unit-tested); this file is the part that talks to
 * Postgres. It is a service rather than a route handler on purpose — Phase 5 pushes a
 * notification for every row it writes, Phase 6's CRM reads the same rows as a call
 * worklist, and a cron re-match would use it too.
 *
 * Two strategies, chosen by MATCH_STRATEGY:
 *
 *   radius (default)  Walk MATCH_RADII_KM outwards (5 → 10 → 25 → 50) until at least
 *                     MATCH_MIN_CANDIDATES donors are in range. Nearest first.
 *   area              Match on the request's district, widening to the state if that is
 *                     too thin. No coordinates involved.
 *
 * A request with no coordinates always uses `area`, whatever the flag says — there is
 * nothing to measure from.
 */

/** Candidate donors are always compatible, available, ACTIVE and not the requester. */
function candidateWhere(request) {
  return donorBaseWhere({
    bloodGroup: request.bloodGroup,
    // Matching is always compatibility-aware. Search defaults to an exact group because a
    // person browsing usually means "find me B+"; a live request means "find me anyone
    // whose blood is safe for this patient", and narrowing that would cost lives at the
    // margin.
    compatible: true,
    availableOnly: true,
    excludeUserIds: [request.requesterId],
  });
}

const CANDIDATE_SELECT = {
  userId: true,
  bloodGroup: true,
  gender: true,
  isAvailable: true,
  lastDonationDate: true,
  profilePhotoUrl: true,
  state: true,
  district: true,
  city: true,
  pincode: true,
  address: true,
  latitude: true,
  longitude: true,
  user: { select: { id: true, name: true, phone: true, status: true } },
};

/**
 * Proximity candidates. Each radius step is one indexed bounding-box read capped at
 * maxCandidateRows, then an exact Haversine filter — the same two-step dance as search,
 * so a donor is never notified about a request they would not appear in search for.
 */
async function findByRadius(request) {
  const where = candidateWhere(request);
  const origin = { latitude: request.latitude, longitude: request.longitude };

  const search = async (radiusKm) => {
    const rows = await prisma.donorProfile.findMany({
      where: withBoundingBox(where, boundingBox(origin.latitude, origin.longitude, radiusKm)),
      select: CANDIDATE_SELECT,
      take: env.search.maxCandidateRows,
    });
    return withinRadius(rankByDistance(rows, origin), radiusKm).filter((row) => row.distanceKm !== null);
  };

  const outcome = await expandingRadiusSearch({
    radii: env.match.radiiKm,
    minCandidates: env.match.minCandidates,
    search,
  });

  return {
    strategy: 'radius',
    radiusKm: outcome.radiusKm,
    steps: outcome.steps,
    reachedMinimum: outcome.reachedMinimum,
    candidates: outcome.candidates,
  };
}

/**
 * Administrative candidates: the request's district first, then the whole state if the
 * district is thin. Distances are still computed where both ends have coordinates — a
 * donor found by district who happens to share their position should still sort sensibly
 * in the CRM's call list.
 */
async function findByArea(request) {
  const origin = hasCoordinates(request) ? request : null;
  const steps = [];

  const fetch = async (area, scope) => {
    const rows = await prisma.donorProfile.findMany({
      where: { ...candidateWhere(request), ...area },
      select: CANDIDATE_SELECT,
      take: env.match.maxCandidates,
    });
    steps.push({ scope, found: rows.length });
    return origin ? rankByDistance(rows, origin) : rows.map((row) => ({ ...row, distanceKm: null }));
  };

  let candidates = [];
  if (request.district) {
    candidates = await fetch({ district: { equals: request.district, mode: 'insensitive' } }, 'district');
  }

  if (candidates.length < env.match.minCandidates && request.state) {
    const statewide = await fetch({ state: { equals: request.state, mode: 'insensitive' } }, 'state');
    if (statewide.length > candidates.length) candidates = statewide;
  }

  return {
    strategy: 'area',
    radiusKm: null,
    steps,
    reachedMinimum: candidates.length >= env.match.minCandidates,
    candidates,
  };
}

/**
 * Finds candidates for a request without writing anything. Exported so the CRM can
 * preview a worklist and so tests can inspect the choice without side effects.
 */
export async function findCandidates(request) {
  const geoUsable = env.match.strategy === 'radius' && hasCoordinates(request);
  const outcome = geoUsable ? await findByRadius(request) : await findByArea(request);

  return {
    ...outcome,
    // The last radius step can overshoot badly — 50 km around Bhubaneswar is most of the
    // district. Every candidate becomes a push notification, so the nearest N win.
    candidates: outcome.candidates.slice(0, env.match.maxCandidates),
    // Told to the caller so a receiver whose request found nobody sees a real reason
    // rather than an empty list.
    fellBackToArea: !geoUsable && env.match.strategy === 'radius',
  };
}

/**
 * Finds candidates and records them as RequestMatch rows.
 *
 * Idempotent by way of the unique (requestId, donorUserId) constraint: re-running on the
 * same request adds only donors who were not matched before, so a widening re-match never
 * re-notifies anyone. Existing rows keep their original distance and response.
 *
 * Each new row is then pushed to its donor (Phase 5). Notification failure is reported,
 * never thrown: the matches are already committed, and a receiver standing in a hospital
 * corridor should not see their request fail because Expo had a bad minute. Staff can
 * still work the same rows as a call list from the CRM.
 */
export async function createMatchesForRequest(request, { notify = true } = {}) {
  const outcome = await findCandidates(request);

  const existing = await prisma.requestMatch.findMany({
    where: { requestId: request.id },
    select: { donorUserId: true },
  });
  const alreadyMatched = new Set(existing.map((row) => row.donorUserId));

  const fresh = outcome.candidates.filter((candidate) => !alreadyMatched.has(candidate.userId));

  let createdMatches = [];

  if (fresh.length) {
    await prisma.requestMatch.createMany({
      data: fresh.map((candidate) => ({
        requestId: request.id,
        donorUserId: candidate.userId,
        distanceKm: candidate.distanceKm,
      })),
      // Belt and braces against two receivers posting from the same phone at once.
      skipDuplicates: true,
    });

    // createMany cannot return the rows, and each donor's push carries its own matchId so
    // the app can deep-link straight to a respond screen. One read back by donor id gets
    // exactly the rows just written (skipDuplicates may have dropped a race loser).
    createdMatches = await prisma.requestMatch.findMany({
      where: { requestId: request.id, donorUserId: { in: fresh.map((candidate) => candidate.userId) } },
      select: { id: true, donorUserId: true, distanceKm: true, notifiedAt: true },
    });
  }

  // Only rows nobody has been told about yet — the race loser above already has its own
  // notification on the way, and a donor must never hear about one request twice.
  const unnotified = createdMatches.filter((match) => match.notifiedAt === null);

  let notification = { notified: 0, sent: 0, failed: 0, recipientsWithoutDevice: 0 };
  if (notify && unnotified.length) {
    try {
      notification = await notifyMatchedDonors(request, unnotified);
    } catch (err) {
      // The matches exist and the CRM can still call these donors; losing the push is bad,
      // losing the request would be worse.
      console.error(`[match] notifying donors for request ${request.id} failed`, err);
      notification = { ...notification, error: 'PUSH_FAILED' };
    }
  }

  return {
    strategy: outcome.strategy,
    radiusKm: outcome.radiusKm,
    steps: outcome.steps,
    reachedMinimum: outcome.reachedMinimum,
    fellBackToArea: outcome.fellBackToArea,
    matchedCount: fresh.length,
    alreadyMatchedCount: outcome.candidates.length - fresh.length,
    notification,
    // Donor summaries for the response. Staff callers get the full record; a receiver
    // sees the same trimmed view the search screen shows.
    donors: fresh,
  };
}

/**
 * Shapes a stored RequestMatch (with its donor) for the API.
 *
 * The distance is coarsened for anyone who is not staff, for the same reason it is in
 * donorSearchView: a precise distance from a known hospital is a ring on a map around a
 * donor's home, and a receiver who posts requests from two hospitals has two rings. Staff
 * dispatching a worklist keep the exact figure. A donor reading their own match is not
 * staff, but the distance is to their own house, so nothing is being hidden from them.
 */
export function matchView(match, viewer) {
  const staff = viewer?.role === 'STAFF' || viewer?.role === 'ADMIN';
  const ownDistance = viewer?.id === match.donorUserId;

  return {
    id: match.id,
    requestId: match.requestId,
    donorUserId: match.donorUserId,
    distanceKm: staff || ownDistance ? match.distanceKm : coarseKm(match.distanceKm),
    distanceIsApproximate: !staff && !ownDistance && match.distanceKm !== null,
    response: match.response,
    respondedAt: match.respondedAt,
    notifiedAt: match.notifiedAt,
    createdAt: match.createdAt,
    donor: match.donor?.donorProfile
      ? donorSearchView({ ...match.donor.donorProfile, user: match.donor, distanceKm: match.distanceKm }, viewer)
      : null,
  };
}
