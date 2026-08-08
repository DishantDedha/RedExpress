import { NextResponse } from 'next/server';
import { clearSessionCookies } from '@/lib/session-cookies';
import { checkCsrf } from '@/lib/csrf';

/**
 * POST /api/auth/logout
 *
 * Clearing the cookies is the whole of it. The backend keeps no server-side session to
 * destroy — a JWT is valid until it expires or its tokenVersion is bumped — so dropping the
 * tokens on this machine is exactly what "sign out" means here.
 *
 * The interactive path is the server action in lib/actions/auth.js, which works without
 * JavaScript. This handler exists for programmatic callers and for the client-side "your
 * session ended" path.
 *
 * ## Why a sign-out endpoint needs a CSRF check
 *
 * It looks harmless — the worst an attacker achieves is signing someone out. But this is a
 * dashboard used during medical emergencies: a page that quietly logs a staff member out
 * every time they visit it costs a caller their place in a forty-name worklist, and reads as
 * an unreproducible bug rather than an attack. The check is two lines, so it is here.
 */
export async function POST(request) {
  const csrf = await checkCsrf(request);
  if (!csrf.ok) {
    return NextResponse.json(
      { error: { code: 'CSRF_FAILED', message: csrf.reason } },
      { status: 403 },
    );
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response.cookies);
  return response;
}
