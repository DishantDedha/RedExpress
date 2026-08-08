'use client';

import { useState, useTransition } from 'react';
import CallHistory, { LastCallCell } from '@/components/CallHistory';
import { donorCallHistoryAction } from '@/lib/actions/crm';
import { pluralize } from '@/lib/format';

/**
 * The last call, with the rest of the history one keypress away.
 *
 * Staff need "how many times have we already tried this number?" *before* they decide someone
 * is unreachable, and making them leave the worklist to find out is how a donor gets marked
 * dead after a single missed call. So the count is always visible and the detail expands in
 * place.
 *
 * Loaded on open rather than up front: forty rows would otherwise be forty history queries for
 * something nobody has asked to see. `<details>` gives the expandable semantics natively —
 * announced as a collapsed group, toggled with Enter or Space, no ARIA to get wrong.
 *
 * `history` from the parent takes priority over anything fetched here. When an action records a
 * call it returns the fresh list, and the panel must show that immediately rather than the
 * snapshot it loaded a minute ago.
 */
export default function CallHistoryDisclosure({ donorUserId, lastCall, callCount = 0, history = null }) {
  const [loaded, setLoaded] = useState(null);
  const [error, setError] = useState(null);
  const [pending, startTransition] = useTransition();

  const calls = history ?? loaded;

  function handleToggle(event) {
    if (!event.currentTarget.open || calls || pending) return;

    startTransition(async () => {
      const result = await donorCallHistoryAction(donorUserId);
      if (result.ok) {
        setLoaded(result.calls);
        setError(null);
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <div className="space-y-2">
      <LastCallCell lastCall={lastCall} callCount={callCount} />

      {callCount > 0 || calls?.length ? (
        <details onToggle={handleToggle} className="text-xs">
          <summary className="inline-flex min-h-11 cursor-pointer items-center text-brand underline underline-offset-4">
            Recent calls ({pluralize(calls?.length ?? callCount, 'attempt')})
          </summary>

          <div className="mt-2 w-72 max-w-full">
            {/* Announced, because the panel opening and then filling a moment later is
                otherwise a silent change for a screen-reader user. */}
            {pending && !calls ? (
              <p role="status" className="text-ink-muted">
                Loading call history…
              </p>
            ) : error ? (
              <p role="alert" className="text-danger">
                {error}
              </p>
            ) : (
              <CallHistory calls={calls ?? []} emptyMessage="No calls recorded for this donor." />
            )}
          </div>
        </details>
      ) : null}
    </div>
  );
}
