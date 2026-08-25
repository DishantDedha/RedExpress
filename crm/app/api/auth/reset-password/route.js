import { NextResponse } from 'next/server';
import { backendFetch, BackendError } from '@/lib/api';
import { setSessionCookies } from '@/lib/session-cookies';
import { checkCsrf } from '@/lib/csrf';

/**
 * POST /api/auth/reset-password
 *
 * Same shape as api/auth/login/route.js and for the same reason: the backend hands back a
 * fresh access/refresh pair on a successful reset (it signs the account in as part of
 * completing the reset), and those tokens must go straight into httpOnly cookies rather
 * than ever reaching client JavaScript.
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

  const token = typeof body?.token === 'string' ? body.token : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!token || !password) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Enter a new password.',
          fields: { ...(password ? {} : { password: 'Enter a new password.' }) },
        },
      },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await backendFetch('/auth/staff/reset-password', { method: 'POST', body: { token, password } });
  } catch (error) {
    if (error instanceof BackendError) {
      return NextResponse.json(
        { error: { code: error.code, message: error.message, ...(error.fields ? { fields: error.fields } : {}) } },
        { status: error.status },
      );
    }
    throw error;
  }

  const response = NextResponse.json({ user: result.user });
  setSessionCookies(response.cookies, result);
  return response;
}
