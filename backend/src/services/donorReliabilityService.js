import { prisma } from '../config/prisma.js';

/**
 * A donor's recent phone reachability, as reported by the requesters who tried to call
 * them — never by the donor, never by staff. Distinct from CallLog/CallOutcome, which is
 * staff reporting what they themselves heard: this is a stranger's unverified word, so it
 * only ever produces a soft, staff-reviewed tag here. Nothing in this file changes a
 * User.status or writes to CallLog — that stays a human decision in the CRM
 * (donorLifecycleService.markUserDead), the same as it is today.
 */

export const RELIABILITY_TAGS = {
  /** Most recent relevant report was a pickup. */
  LIKELY: 'LIKELY_TO_RESPOND',
  /** A short run of no-answers — worth noting, not yet worth flagging. */
  SLOW: 'SLOW_TO_RESPOND',
  /** A long enough run that staff should take a look. */
  UNRESPONSIVE: 'UNRESPONSIVE',
  /** No usable reports yet. */
  UNKNOWN: 'NO_SIGNAL',
};

export const RELIABILITY_LABELS = {
  [RELIABILITY_TAGS.LIKELY]: 'Likely to respond',
  [RELIABILITY_TAGS.SLOW]: 'Slow to respond lately',
  [RELIABILITY_TAGS.UNRESPONSIVE]: 'Unresponsive',
  [RELIABILITY_TAGS.UNKNOWN]: 'No call history yet',
};

/** How far back to look for a streak. Older matches than this tell you nothing current. */
const LOOKBACK = 20;

/** A no-answer streak this long or longer surfaces the donor for staff review. */
export const REVIEW_THRESHOLD = 3;

/**
 * Walks a donor's matches newest-first and finds the current run of consecutive
 * NO_ANSWER reports.
 *
 *   WRONG_NUMBER   is a data problem (their number on file is wrong), not a behaviour one —
 *                  skipped entirely, neither breaking nor extending the streak.
 *   PICKED_UP      ends the walk; the streak is whatever it was before this report (i.e.
 *                  zero, since a pickup is always the most recent relevant event once hit).
 *   NO_ANSWER      extends the streak by one and continues.
 *   unreported     ends the walk. Silence is a gap in what we know, never an assumed
 *                  no-answer — three real no-answers with a fourth, unreported match mixed
 *                  in in reality do not become "four in a row" here.
 *
 * `matches` must already be ordered newest-first by the caller.
 */
export function noAnswerStreak(matches) {
  let streak = 0;
  let lastOutcome = null;

  for (const match of matches) {
    if (match.requesterCallOutcome === 'WRONG_NUMBER') continue;

    if (match.requesterCallOutcome === 'PICKED_UP') {
      lastOutcome = 'PICKED_UP';
      break;
    }

    if (match.requesterCallOutcome === 'NO_ANSWER') {
      streak += 1;
      lastOutcome = 'NO_ANSWER';
      continue;
    }

    break; // no report on this match at all — a gap, not a no-answer
  }

  return { streak, lastOutcome };
}

/** Turns a streak into the word staff and the CRM actually see. */
export function reliabilityTag(streak, lastOutcome) {
  if (streak >= REVIEW_THRESHOLD) return RELIABILITY_TAGS.UNRESPONSIVE;
  if (streak >= 1) return RELIABILITY_TAGS.SLOW;
  if (lastOutcome === 'PICKED_UP') return RELIABILITY_TAGS.LIKELY;
  return RELIABILITY_TAGS.UNKNOWN;
}

function summaryFrom(matches) {
  const { streak, lastOutcome } = noAnswerStreak(matches);
  const lastReported = matches.find((match) => match.requesterCallOutcome);

  return {
    tag: reliabilityTag(streak, lastOutcome),
    label: RELIABILITY_LABELS[reliabilityTag(streak, lastOutcome)],
    noAnswerStreak: streak,
    needsReview: streak >= REVIEW_THRESHOLD,
    lastReportedAt: lastReported?.requesterCallOutcomeAt ?? null,
  };
}

/** One donor's current reliability summary. */
export async function donorReliability(donorUserId) {
  const matches = await prisma.requestMatch.findMany({
    where: { donorUserId },
    orderBy: { createdAt: 'desc' },
    take: LOOKBACK,
    select: { requesterCallOutcome: true, requesterCallOutcomeAt: true },
  });

  return summaryFrom(matches);
}

/**
 * Batched version for a page of donors — same shape and calling convention as
 * callSummariesFor in callLogService.js.
 *
 * One query per donor rather than a single windowed query: the CRM and search pages this
 * feeds render a handful to a couple dozen donors at a time, and a per-donor streak walk
 * needs each donor's own newest-first slice, which a single flat query would still have to
 * group in application code anyway. Worth revisiting with a window function if this ever
 * runs over hundreds of donors at once.
 */
export async function donorReliabilityFor(donorUserIds) {
  if (!donorUserIds.length) return new Map();

  const entries = await Promise.all(
    donorUserIds.map(async (id) => [id, await donorReliability(id)]),
  );

  return new Map(entries);
}
