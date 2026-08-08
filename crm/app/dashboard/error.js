'use client';

import { ErrorState } from '@/components/ui/States';

/**
 * Error boundary for the dashboard.
 *
 * `reset()` re-renders the segment, which is the right offer when the cause was the backend
 * being briefly unreachable — much better than asking a staff member to reload and lose their
 * place in a worklist.
 *
 * The message shown is the one thrown by lib/api.js: a plain sentence written for a user. In
 * production Next replaces an unexpected error's message with a generic one and gives us a
 * `digest` to match against the server log, which is why the reference code is displayed.
 *
 * Note this boundary covers the *pages* under /dashboard, not the dashboard layout itself —
 * a layout's errors are caught by its parent, so a failure in the session lookup surfaces in
 * app/error.js instead. Both render the same component, so the staff member sees the same
 * message either way; only the surrounding chrome differs.
 */
export default function DashboardError({ error, reset }) {
  return (
    <ErrorState
      title="This page could not be loaded"
      message={error?.message || 'Something went wrong while loading the dashboard.'}
      code={error?.digest}
      onRetry={reset}
    />
  );
}
