import { NextResponse } from 'next/server';
import { backendFetch, BackendError } from '@/lib/api';
import { checkCsrf } from '@/lib/csrf';

/**
 * POST /api/auth/forgot-password
 *
 * A thin, CSRF-checked pass-through to the backend — see api/auth/login/route.js for why a
 * route handler (unlike a Server Action) needs the explicit check. There are no tokens to
 * put in a cookie here; the backend's response is already the generic "if that email has an
 * account…" message regardless of whether it does, so the handler has nothing to redact
 * either.
 */
export async function POST(request) {
  const csrf = await checkCsrf(request);
  if (!csrf.ok) {
    return NextResponse.json({ error: { code: 'CSRF_FAILED', message: csrf.reason } }, { status: 403 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } },
      { status: 400 },
    );
  }

  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (!email) {
    return NextResponse.json(
      { error: { code: 'VALIDATION_ERROR', message: 'Enter your email address.', fields: { email: 'Enter your email address.' } } },
      { status: 400 },
    );
  }

  try {
    const result = await backendFetch('/auth/staff/forgot-password', { method: 'POST', body: { email } });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof BackendError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } },
        { status: error.status },
      );
    }
    throw error;
  }
}
