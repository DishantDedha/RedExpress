import LoginForm from './LoginForm';

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
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="flex items-center justify-center gap-2 text-2xl font-bold text-brand">
            <span aria-hidden="true">✚</span>
            Red Express
          </p>
          <p className="mt-1 text-sm text-ink-muted">Staff dashboard</p>
        </div>

        <div className="rounded-lg border border-line bg-card p-6 shadow-sm">
          <LoginForm reason={reason} next={next} />
        </div>

        <p className="mt-6 text-center text-sm text-ink-muted">
          Donors and receivers sign in on the Red Express app with a one-time password. This dashboard is
          for Red Express staff only.
        </p>
      </div>
    </main>
  );
}
