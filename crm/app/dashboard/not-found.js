import Link from 'next/link';
import { EmptyState } from '@/components/ui/States';

export const metadata = { title: 'Record not found' };

/**
 * A record that no longer exists, rendered inside the dashboard shell.
 *
 * The root not-found.js handles unknown addresses and replaces the whole page. This one keeps
 * the sidebar and topbar, because a staff member who followed a stale link to a deleted donor
 * has not left the dashboard and should not be made to navigate back into it.
 */
export default function DashboardNotFound() {
  return (
    <>
      <h1 className="mb-6 text-2xl font-bold text-ink">Record not found</h1>

      <EmptyState
        title="This record is no longer in Red Express"
        message="It may have been removed since the link was created. Search for the person or request instead."
      >
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/dashboard/users"
            className="inline-flex min-h-11 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-pressed"
          >
            Search people
          </Link>
          <Link
            href="/dashboard/requests"
            className="inline-flex min-h-11 items-center rounded-md border border-line-strong bg-card px-4 text-sm font-semibold text-ink hover:bg-surface"
          >
            See blood requests
          </Link>
        </div>
      </EmptyState>
    </>
  );
}
