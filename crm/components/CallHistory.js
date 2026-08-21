import Badge from '@/components/ui/Badge';
import { CALL_OUTCOMES, callOutcomeLabel } from '@/lib/constants';
import { formatDateTime, formatRelative } from '@/lib/format';

/**
 * What happened the last time anyone rang this donor.
 *
 * Used inside a table cell, so it stays to one line plus a timestamp. "Never called" is stated
 * outright — an empty cell in a calling worklist is the difference between "nobody has tried"
 * and "the column failed to load", and staff decide who to ring next on exactly that.
 */
export function LastCallCell({ lastCall, callCount = 0 }) {
  if (!lastCall) {
    return <span className="text-ink-muted">Never called</span>;
  }

  const tone = CALL_OUTCOMES[lastCall.outcome]?.tone ?? 'neutral';

  return (
    <div className="space-y-1">
      <Badge tone={tone}>{callOutcomeLabel(lastCall.outcome)}</Badge>
      <p className="text-xs text-ink-muted">
        {formatDateTime(lastCall.createdAt)}
        {lastCall.staffName ? ` · ${lastCall.staffName}` : ''}
      </p>
      {callCount > 1 ? (
        <p className="text-xs text-ink-muted">
          {callCount} attempts in total
        </p>
      ) : null}
    </div>
  );
}

/**
 * The full call log for one person.
 *
 * An ordered list, newest first, and it says so — "newest first" is obvious from a glance at
 * the timestamps and invisible to someone hearing the entries one at a time.
 *
 * MARKED_DEAD entries sit in the same list as ordinary calls on purpose: the decision to take
 * someone out of circulation belongs in the same story as the three unanswered rings that led
 * to it (see backend/docs/crm-lifecycle.md).
 */
export default function CallHistory({ calls, emptyMessage = 'No calls have been made to this person yet.' }) {
  if (!calls?.length) {
    return <p className="text-sm text-ink-muted">{emptyMessage}</p>;
  }

  return (
    <>
      <p className="mb-3 text-sm text-ink-muted">Newest call first.</p>
      <ol className="space-y-3">
        {calls.map((call) => {
          const tone = CALL_OUTCOMES[call.outcome]?.tone ?? 'neutral';

          return (
            <li key={call.id} className="rounded-lg border border-line bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone}>{callOutcomeLabel(call.outcome)}</Badge>
                <span className="text-sm text-ink-muted">
                  {formatDateTime(call.createdAt)} ({formatRelative(call.createdAt)})
                </span>
              </div>

              <p className="mt-1.5 text-sm text-ink-muted">
                By {call.staffName ?? 'a staff member'}
                {call.requestId ? ' · while working a blood request' : ''}
              </p>

              {call.note ? <p className="mt-1.5 text-sm text-ink">{call.note}</p> : null}
            </li>
          );
        })}
      </ol>
    </>
  );
}
