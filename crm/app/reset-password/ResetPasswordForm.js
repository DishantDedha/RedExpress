'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import { CSRF_COOKIE, CSRF_HEADER } from '@/lib/session-cookies';

function readCookie(name) {
  if (typeof document === 'undefined') return '';
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : '';
}

/**
 * Sets the new password and completes the sign-in the backend hands back with it — see
 * api/auth/reset-password/route.js. Mirrors login/LoginForm.js's submit shape.
 */
export default function ResetPasswordForm({ token }) {
  const router = useRouter();

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);

  const passwordRef = useRef(null);
  const alertRef = useRef(null);

  useEffect(() => {
    passwordRef.current?.focus();
  }, []);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  async function handleSubmit(event) {
    event.preventDefault();
    setFormError(null);
    setFieldErrors({});

    if (password.length < 8) {
      setFieldErrors({ password: 'Password must be at least 8 characters.' });
      return;
    }
    if (password !== confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match.' });
      return;
    }

    setBusy(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [CSRF_HEADER]: readCookie(CSRF_COOKIE) },
        body: JSON.stringify({ token, password }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        setFieldErrors(payload?.error?.fields ?? {});
        setFormError(
          payload?.error?.message ?? 'That reset link is invalid or has expired. Request a new one.',
        );
        return;
      }

      router.replace('/dashboard');
      router.refresh();
    } catch {
      setFormError('Cannot reach the dashboard server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <h1 className="text-xl font-bold text-ink">Set a new password</h1>

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
        ref={passwordRef}
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={fieldErrors.password}
        hint="At least 8 characters."
      />

      <Field
        label="Confirm new password"
        name="confirmPassword"
        type="password"
        autoComplete="new-password"
        required
        value={confirmPassword}
        onChange={(event) => setConfirmPassword(event.target.value)}
        error={fieldErrors.confirmPassword}
      />

      <Button type="submit" size="lg" busy={busy} busyLabel="Saving…" className="w-full">
        Set new password
      </Button>
    </form>
  );
}
