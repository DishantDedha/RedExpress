import LoginForm from './LoginForm';
import { BrandMark } from '@/components/ui/Icon';

export const metadata = { title: 'Sign in' };

/**
 * Staff sign-in.
 *
 * A server component wrapping a small client form: nothing here needs the browser except the
 * form itself. The proxy has already bounced anyone who arrives holding a valid session, so
 * this page only ever renders for someone who genuinely needs to sign in.
 *
 * `reason` explains *why* they are looking at a login screen, which is the difference between
 * "the app is broken" and "your session ended". `next` is the path they were trying to reach.
 *
 * ## The layout
 *
 * A red panel carrying the brand, and a white card carrying the form. It is the same split
 * the rest of the dashboard uses and the same one the app's sign-in flow uses — red states
 * who this is, white is where you do the work — so a staff member who has seen the phone app
 * recognises this screen before reading it.
 *
 * The brand panel is hidden below `lg`, not stacked. It carries no information the form needs
 * and, stacked on a laptop at 200% zoom, it would push the password field below the fold.
 *
 * The mark replaced a bare `✚` character, which screen readers announce as "plus sign" or
 * skip entirely depending on the voice. It is an `<svg aria-hidden>` now — see `Icon`.
 */
export default async function LoginPage({ searchParams }) {
  const params = await searchParams;

  const reason = typeof params?.reason === 'string' ? params.reason : null;
  // Must be a path on this site. '//evil.example' also starts with '/' and is a protocol-
  // relative URL, so it is rejected too — this value ends up in a redirect.
  const requested = typeof params?.next === 'string' ? params.next : '';
  const next = requested.startsWith('/') && !requested.startsWith('//') ? requested : '/dashboard';

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-panel border border-line bg-card shadow-raised lg:grid-cols-2">
        {/* Decorative and identity only — every word in it is repeated in the form's own
            copy, which is why it can be dropped entirely on a narrow screen. */}
        <div className="brand-band hidden flex-col justify-between p-8 lg:flex">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9 text-white" />
            <span className="text-lg font-bold tracking-tight text-white">Red Express</span>
          </div>

          <div>
            <p className="text-2xl font-bold leading-snug text-white">
              The calling list, the donors, and every open request in one place.
            </p>
            <p className="mt-3 text-sm text-on-brand-muted">
              Handle donor data with care. Phone numbers and addresses are only ever shown to the
              roles entitled to see them.
            </p>
          </div>
        </div>

        <div className="p-6 md:p-8">
          <div className="mb-6 lg:hidden">
            <p className="flex items-center gap-2 text-2xl font-bold text-brand">
              <BrandMark className="h-7 w-7 text-brand" cross="var(--color-card)" />
              Red Express
            </p>
            <p className="mt-1 text-sm text-ink-muted">Staff dashboard</p>
          </div>

          <LoginForm reason={reason} next={next} />

          <p className="mt-6 text-sm text-ink-muted">
            Donors and receivers sign in on the Red Express app with a one-time password. This
            dashboard is for Red Express staff only.
          </p>
        </div>
      </div>
    </main>
  );
}
