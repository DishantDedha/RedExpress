import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/errors.js';

/**
 * Call logs — what happened when a staff member picked up the phone.
 *
 * Deliberately separate from RequestMatch.response: a match response is the donor
 * speaking for themselves in the app, a call log is staff reporting what they heard. When
 * the two disagree (a donor who declined in the app but says yes on the phone) both
 * records survive, and the CRM shows them side by side rather than one overwriting the
 * other.
 */

/** Outcomes staff may record directly. MARKED_DEAD is written only by markDonorDead. */
export const MANUAL_CALL_OUTCOMES = ['PICKED_UP', 'NO_ANSWER', 'WRONG_NUMBER'];

export function callLogView(log) {
  return {
    id: log.id,
    donorUserId: log.donorUserId,
    requestId: log.requestId,
    outcome: log.outcome,
    note: log.note,
    createdAt: log.createdAt,
    staffId: log.staffId,
    staffName: log.staff?.name ?? null,
  };
}

const WITH_STAFF = { staff: { select: { name: true } } };

/**
 * Newest call per donor, for a page of donors.
 *
 * Pure so the reduction is obvious and testable; the caller supplies rows already sorted
 * newest-first. Returns a Map keyed by donorUserId.
 */
export function latestCallByDonor(logs) {
  const latest = new Map();
  for (const log of logs) {
    const current = latest.get(log.donorUserId);
    if (!current || log.createdAt > current.createdAt) latest.set(log.donorUserId, log);
  }
  return latest;
}

/**
 * One round-trip that answers "when did we last ring each of these people, and how many
 * times have we tried?" for a whole page of search results.
 *
 * `distinct` with a matching leading orderBy lets Postgres do the per-donor pick; the
 * counts come from a groupBy rather than from the same rows, because the distinct query
 * only returns one row each by design.
 */
export async function callSummariesFor(donorUserIds) {
  if (!donorUserIds.length) return new Map();

  const [latest, counts] = await Promise.all([
    prisma.callLog.findMany({
      where: { donorUserId: { in: donorUserIds } },
      orderBy: [{ donorUserId: 'asc' }, { createdAt: 'desc' }],
      distinct: ['donorUserId'],
      include: WITH_STAFF,
    }),
    prisma.callLog.groupBy({
      by: ['donorUserId'],
      where: { donorUserId: { in: donorUserIds } },
      _count: { _all: true },
    }),
  ]);

  const byDonor = latestCallByDonor(latest);
  const countByDonor = new Map(counts.map((row) => [row.donorUserId, row._count._all]));

  return new Map(
    donorUserIds.map((id) => [
      id,
      {
        lastCall: byDonor.has(id) ? callLogView(byDonor.get(id)) : null,
        callCount: countByDonor.get(id) ?? 0,
      },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Records a call attempt.
 *
 * The donor must be a real app user — logging a call against a staff account, or against
 * an id that no longer exists, would put a row in the history that nobody can explain.
 * The request, when given, must exist too: the CRM uses `requestId` to show "three
 * attempts for this request", and a dangling one quietly breaks that count.
 */
export async function recordCall(staff, { donorUserId, requestId, outcome, note }) {
  if (!MANUAL_CALL_OUTCOMES.includes(outcome)) {
    throw ApiError.badRequest(
      'INVALID_OUTCOME',
      'Use the mark as unreachable action to record a donor as dead.',
      { outcome: 'Choose picked up, no answer or wrong number.' },
    );
  }

  const donor = await prisma.user.findUnique({ where: { id: donorUserId }, select: { id: true, role: true } });
  if (!donor) throw ApiError.notFound('USER_NOT_FOUND', 'That person is no longer in Red Express.');
  if (donor.role === 'STAFF' || donor.role === 'ADMIN') {
    throw ApiError.badRequest('NOT_AN_APP_USER', 'Call logs are for donors and receivers, not staff accounts.');
  }

  if (requestId) {
    const exists = await prisma.bloodRequest.findUnique({ where: { id: requestId }, select: { id: true } });
    if (!exists) throw ApiError.notFound('REQUEST_NOT_FOUND', 'That blood request no longer exists.');
  }

  const log = await prisma.callLog.create({
    data: {
      staffId: staff.id,
      donorUserId,
      requestId: requestId ?? null,
      outcome,
      note: note ?? null,
    },
    include: WITH_STAFF,
  });

  return {
    callLog: callLogView(log),
    // Fresh history so the CRM row can re-render its "3 attempts" line without a refetch.
    history: await listCalls({ donorUserId }),
    message: 'Call recorded.',
  };
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Call history, newest first. Filterable by donor, by request, or by both. */
export async function listCalls({ donorUserId, requestId, staffId, take = 20 } = {}) {
  const logs = await prisma.callLog.findMany({
    where: {
      ...(donorUserId ? { donorUserId } : {}),
      ...(requestId ? { requestId } : {}),
      ...(staffId ? { staffId } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take,
    include: WITH_STAFF,
  });

  return logs.map(callLogView);
}
