import { NextResponse } from 'next/server';
import { backendFetch, BackendError } from '@/lib/api';
import { setSessionCookies } from '@/lib/session-cookies';
import { checkCsrf } from '@/lib/csrf';

/**
 * POST /api/auth/login
 *
 * The token exchange runs here, on the server, for one reason: the access and refresh tokens
 * must never exist in client JavaScript. The browser posts credentials to this handler, the
 * handler calls the backend, and the tokens go straight into httpOnly cookies. What comes back
 * to the login form is only the public user record.
 *
 * Route handlers get none of the Origin check Next applies to Server Actions, so the CSRF
 * check is explicit and first. Without it, a page anywhere on the internet could sign a staff
 * member into *the attacker's* account, and every donor they then marked unreachable would be
 * audited under the wrong name — see lib/csrf.js.
 */
export async function POST(request) {
  const csrf = await checkCsrf(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: { code: 'CSRF_FAILED', message: csrf.reason } },
      { status: 403 },
    );
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
  const password = typeof body?.password === 'string' ? body.password : '';

  // Cheap local check so an empty submit does not cost a round trip. The backend's zod schema
  // is still the authority on what a valid credential looks like.
  if (!email || !password) {
    return NextResponse.json(
      {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Enter your email address and password.',
          fields: {
            ...(email ? {} : { email: 'Enter your email address.' }),
            ...(password ? {} : { password: 'Enter your password.' }),
          },
        },
      },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await backendFetch('/auth/staff/login', { method: 'POST', body: { email, password } });
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
