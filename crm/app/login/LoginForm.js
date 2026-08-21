'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/session-cookies';

/**
 * The sign-in form.
 *
 * Credentials go to /api/auth/login — a Next route handler on our own origin — which does the
 * exchange with the backend and puts the tokens in httpOnly cookies. Nothing token-shaped ever
 * touches this component.
 *
 * ## The CSRF token
 *
 * Route handlers get none of the Origin check Next applies to Server Actions, so this POST
 * carries a token the handler checks against a cookie (see lib/csrf.js for the attack this
 * closes). The value is read from `document.cookie` at submit time rather than passed down as
 * a prop, because the proxy sets that cookie on the *response* that carries this page — a
 * server component rendering the same request cannot see it yet, so a prop would be empty on
 * the very first visit, which is the one visit that matters.
 *
 * Accessibility notes worth keeping when this form is edited:
 *   - the failure banner is role="alert" AND takes focus, because a message that only appears
 *     visually is a message a screen-reader user never receives;
 *   - per-field errors come back from the backend's `fields` map and are rendered by Field,
 *     which links them with aria-describedby;
 *   - the submit button's busy state changes its text, not just its colour.
 */

const REASONS = {
  expired: 'Your session ended. Please sign in again.',
  required: 'Please sign in to open the dashboard.',
  'signed-out': 'You have been signed out.',
  // Not the staff member's fault and not fixable by signing in — say so, rather than letting
  // them retype a password at a service that is down.
  unavailable: 'The Red Express API cannot be reached right now. Your session was kept — try reloading in a moment.',
};

/**
 * Reads one cookie by name.
 *
 * Returns '' rather than null when absent, so the header is always present and the handler's
 * answer is a clear "your page has expired, reload" instead of a request that looks
 * structurally different from a genuine one.
 */
function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

export default function LoginForm({ reason, next }) {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const alertRef = useRef(null);
  const emailRef = useRef(null);

  // The heading is the page title; the first thing a keyboard user needs is the first field.
  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  // Move focus to the failure message when one appears, so it is read immediately and the
  // next Tab continues from the form rather than the top of the document.
  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [CSRF_HEADER]: readCookie(CSRF_COOKIE),
        },
        body: JSON.stringify({ email, password }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors(payload?.error?.fields ?? {});
        setFormError(payload?.error?.message ?? 'Sign-in failed. Please try again.');
        return;
      }

      // replace() rather than push() so the browser Back button does not land on a login form
      // that immediately redirects. refresh() re-runs the server components with the new
      // cookie in place.
      router.replace(next || '/dashboard');
      router.refresh();
    } catch {
      setFormError('Cannot reach the dashboard server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  const notice = reason ? REASONS[reason] : null;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">Sign in</h1>

      {notice ? (
        <p role="status" className="rounded-lg border border-info bg-info-tint p-3 text-sm text-ink">
          {notice}
        </p>
      ) : null}

      {formError ? (
        <p
          ref={alertRef}
          role="alert"
          tabIndex={-1}
          className="rounded-lg border border-danger bg-danger-tint p-3 text-sm font-medium text-ink"
        >
          <span aria-hidden="true" className="mr-1.5 text-danger">
            ⚠
          </span>
          {formError}
        </p>
      ) : null}

      <Field
        ref={emailRef}
        label="Email address"
        name="email"
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={fieldErrors.email}
      />

      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
      />

      <Button type="submit" size="lg" busy={busy} busyLabel="Signing in…" className="w-full">
        Sign in
      </Button>
    </form>
  );
}
