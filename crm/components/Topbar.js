import { logoutAction } from '@/lib/actions/auth';
import { roleLabel } from '@/lib/roles';

/**
 * The bar above the content: who you are, and how to stop being them.
 *
 * The brand moved to the rail, so this is no longer the dashboard's masthead — it is a thin
 * strip belonging to the content column, and it stays deliberately quiet. Nothing here is a
 * destination; the destinations are all in the rail beside it.
 *
 * The role is shown next to the name on purpose — the CRM hides ADMIN-only controls, and a
 * staff member who cannot find the Reactivate button should be able to see why in one glance
 * rather than assume the page is broken.
 *
 * The initials disc is decorative and hidden. It sits directly beside the name it is the
 * initials of, so announcing "A S" first would be a stop that teaches nobody anything.
 *
 * Sign out is a form posting to a server action, so it survives a failed JS bundle and cannot
 * be fired by a link prefetch.
 */
export default function Topbar({ user }) {
  const name = user.name || user.email;

  return (
    <header className="flex items-center justify-end gap-4 border-b border-line bg-card px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-sm font-bold text-brand-ink sm:flex"
        >
          {initialsOf(name)}
        </span>

        <p className="text-right text-sm leading-tight">
          <span className="block font-semibold text-ink">{name}</span>
          <span className="block text-ink-muted">{roleLabel(user.role)}</span>
        </p>
      </div>

      <form action={logoutAction}>
        <button
          type="submit"
          className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-card px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface"
        >
          Sign out
        </button>
      </form>
    </header>
  );
}

/** First letter of the first word and of the last, so "Anita Sahu" and "Anita" both work. */
function initialsOf(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();
  return (words[0].slice(0, 1) + words[words.length - 1].slice(0, 1)).toUpperCase();
}
