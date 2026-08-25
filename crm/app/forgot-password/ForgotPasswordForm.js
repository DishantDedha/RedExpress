'use client';

import { useEffect, useRef, useState } from 'react';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/session-cookies';

/**
 * Requests a reset link. Mirrors login/LoginForm.js — same CSRF cookie, same route-handler
 * pass-through — with one deliberate difference: success replaces the form with a plain
 * sentence rather than a redirect, because there is nowhere to redirect to yet and no
 * account state has changed.
 */
function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

export default function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const emailRef = useRef(null);
  const alertRef = useRef(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: readCookie(CSRF_COOKIE) },
        body: JSON.stringify({ email }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors(payload?.error?.fields ?? {});
        setFormError(payload?.error?.message ?? 'Something went wrong. Please try again.');
        return;
      }

      setSent(true);
    } catch {
      setFormError('Cannot reach the dashboard server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-xl font-bold text-ink">Check your email</h1>
        <p role="status" className="rounded-lg border border-info bg-info-tint p-3 text-sm text-ink">
          If <strong>{email}</strong> has a Red Express dashboard account, a reset link is on its way. It
          expires in 30 minutes.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">Forgot password</h1>
      <p className="text-sm text-ink-muted">
        Enter the email address on your staff account and we will send a link to set a new password.
      </p>

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

      <Button type="submit" size="lg" busy={busy} busyLabel="Sending…" className="w-full">
        Send reset link
      </Button>
    </form>
  );
}
