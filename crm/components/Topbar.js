import { logoutAction } from '@/lib/actions/auth';
import { roleLabel } from '@/lib/roles';

/**
 * The dashboard header: who you are, and how to stop being them.
 *
 * The role is shown next to the name on purpose — the CRM hides ADMIN-only controls, and a
 * staff member who cannot find the Reactivate button should be able to see why in one glance
 * rather than assume the page is broken.
 *
 * Sign out is a form posting to a server action, so it survives a failed JS bundle and cannot
 * be fired by a link prefetch.
 */
export default function Topbar({ user }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-line bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="text-xl text-brand">
          ✚
        </span>
        <span className="text-lg font-bold text-brand">Red Express</span>
      </div>

      <div className="flex items-center gap-4">
        <p className="text-right text-sm leading-tight">
          <span className="block font-semibold text-ink">{user.name || user.email}</span>
          <span className="block text-ink-muted">{roleLabel(user.role)}</span>
        </p>

        <form action={logoutAction}>
          <button
            type="submit"
            className="inline-flex min-h-11 items-center rounded-md border border-line-strong bg-card px-4 text-sm font-semibold text-ink hover:bg-surface"
          >
            Sign out
          </button>
        </form>
      </div>
    </header>
  );
}
