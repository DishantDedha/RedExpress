import StatusBadge from '@/components/ui/StatusBadge';

/**
 * What "dead" means, for staff who have not been told.
 *
 * The word is Red Express jargon and it is an alarming piece of jargon to meet for the first
 * time on a button next to a real person's name. This legend is on the worklist and on every
 * donor page so nobody has to ask a colleague, and so nobody assumes it is irreversible.
 *
 * A `<details>` rather than a permanent block: experienced staff collapse it and get their
 * table back, new staff open it. It is closed by default but reachable by keyboard and
 * announced as expandable, which a paragraph hidden behind a tooltip would not be.
 *
 * The full mechanism is in backend/docs/crm-lifecycle.md.
 */
export default function LifecycleLegend() {
  return (
    <details className="rounded-lg border border-line bg-card p-4">
      <summary className="min-h-11 cursor-pointer list-item font-semibold text-ink">
        What do Active, Dead and Blocked mean?
      </summary>

      <div className="mt-3 space-y-4 text-sm text-ink">
        <ol className="space-y-3">
          <li className="flex flex-wrap items-baseline gap-2">
            <StatusBadge status="ACTIVE" />
            <span>
              The normal state. The donor appears in search and is alerted when someone nearby needs
              their blood group.
            </span>
          </li>

          <li className="flex flex-wrap items-baseline gap-2">
            <StatusBadge status="DEAD" />
            <span>
              <strong>Unreachable by phone — not deceased.</strong> Staff set this after the number
              stops reaching the donor. They leave search, stop receiving alerts, and are signed out
              everywhere.
            </span>
          </li>

          <li className="flex flex-wrap items-baseline gap-2">
            <span className="font-semibold text-brand">Back to active</span>
            <span>
              The donor does this themselves. Opening the app and signing in with a one-time password
              returns them to active automatically — no staff action needed. That is the normal way
              back, and it is why marking someone dead is safe to do when in doubt.
              {/* The bit staff otherwise phone up about: an active donor who is still not being
                  alerted. Signing in proves the number reaches them, not that they are free to
                  donate, so availability stays off until they say so. */}
              <strong className="mt-1 block font-semibold">
                Signing in does not switch their availability back on.
              </strong>
              They come back active, but still marked not available, until they turn availability on
              from their own profile in the app. So a donor can show as active here and still not
              receive alerts.
            </span>
          </li>

          <li className="flex flex-wrap items-baseline gap-2">
            <StatusBadge status="BLOCKED" />
            <span>
              Blocked by an administrator. Unlike dead, the donor cannot sign in at all and cannot
              clear it themselves.
            </span>
          </li>
        </ol>

        <p className="rounded-md border border-info bg-info-tint p-3">
          <span aria-hidden="true">ℹ </span>
          Administrators can also reactivate a donor by hand, for when someone was marked unreachable
          in error. That restores them to search immediately but does not restore their session — they
          still sign in again on the app.
        </p>
      </div>
    </details>
  );
}
