/**
 * The loading / error / empty patterns every dashboard page reuses.
 *
 * All three announce themselves. A staff member who cannot see the page still needs to know
 * the difference between "still loading", "nothing matched" and "the API is down" — three
 * situations that look identical if the only signal is an area of the screen that stayed
 * blank.
 */

/** Skeleton placeholder for a Suspense fallback (app/dashboard/loading.js). */
export function LoadingState({ label = 'Loading…', rows = 3 }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <p className="text-sm text-ink-muted">{label}</p>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          aria-hidden="true"
          className="h-16 animate-pulse rounded-panel border border-line bg-card"
        />
      ))}
    </div>
  );
}

/**
 * Failure. `role="alert"` because an error the staff member did not ask for should interrupt,
 * and a retry control because "reload the page" is not a fix a user should have to invent.
 */
export function ErrorState({ title = 'Something went wrong', message, code, onRetry, retryLabel = 'Try again' }) {
  return (
    <div role="alert" className="rounded-panel border border-danger bg-danger-tint p-4 shadow-card">
      <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
        <span aria-hidden="true" className="text-danger">
          ⚠
        </span>
        {title}
      </h2>

      {message ? <p className="mt-2 text-sm text-ink">{message}</p> : null}

      {code ? (
        <p className="mt-2 text-xs text-ink-muted">
          Reference code: <code className="font-mono">{code}</code>
        </p>
      ) : null}

      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-card px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

/** "No results" — a real message, never an empty table with no explanation. */
export function EmptyState({ title = 'Nothing to show', message, children }) {
  return (
    <div className="rounded-panel border border-dashed border-line-strong bg-blush p-8 text-center">
      <p className="text-base font-semibold text-ink">{title}</p>
      {message ? <p className="mx-auto mt-1 max-w-md text-sm text-ink-muted">{message}</p> : null}
      {children ? <div className="mt-4 flex justify-center">{children}</div> : null}
    </div>
  );
}
