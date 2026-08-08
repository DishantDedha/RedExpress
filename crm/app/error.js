'use client';

import { ErrorState } from '@/components/ui/States';

/** Top-level boundary — catches anything that escapes a route segment, including /login. */
export default function AppError({ error, reset }) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <ErrorState
        title="Something went wrong"
        message={error?.message || 'The dashboard hit an unexpected error.'}
        code={error?.digest}
        onRetry={reset}
      />
    </main>
  );
}
