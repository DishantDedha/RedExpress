import { NextResponse } from 'next/server';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearSessionCookies,
  setSessionCookies,
} from '@/lib/session-cookies';
import { CSRF_COOKIE, createCsrfToken, csrfCookieOptions } from '@/lib/csrf';

/**
 * Route protection and silent token refresh.
 *
 * In Next 16 this file is `proxy.js` — the old `middleware.js` convention is deprecated and
 * warns at build time. The function may be exported as `proxy` or as the default.
 *
 * Two jobs:
 *
 * 1. **Gate /dashboard.** No credentials, no dashboard — and the requested path is remembered
 *    so signing in lands the staff member back on the page they asked for instead of dumping
 *    them at the dashboard home. Note this is a redirect, not authorization: every /crm call
 *    is checked again by the backend, which is the only place the decision actually matters.
 *
 * 2. **Refresh the access token before it becomes a problem.** The access cookie is set to
 *    expire slightly before its token does, so "cookie missing, refresh present" is the normal
 *    signal that a 15-minute token has aged out. Trading it here for a fresh one means a staff
 *    member working a long calling list never gets bounced to /login mid-worklist. If the
 *    backend refuses the refresh — most often because tokenVersion moved — both cookies are
 *    dropped and they sign in again.
 *
 * Deliberately kept to one import of dependency-free constants: the proxy can be deployed to
 * an edge location and must not drag in server-component or Node-only code.
 */

const BACKEND_BASE_URL = process.env.BACKEND_API_BASE_URL ?? 'http://localhost:4000';

export async function proxy(request) {
  const { pathname, search } = request.nextUrl;

  const accessToken = request.cookies.get(ACCESS_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  // Already signed in and asking for the login page — send them on through.
  if (pathname === '/login') {
    if (accessToken) return NextResponse.redirect(new URL('/dashboard', request.url));
    // The login form posts to a route handler, which gets none of the Origin check Next
    // applies to Server Actions. This is where its CSRF token is minted — the proxy is the
    // only thing that runs before the page and is allowed to set a cookie. See lib/csrf.js.
    return withCsrfToken(request, NextResponse.next());
  }

  if (accessToken) return NextResponse.next();

  if (refreshToken) {
    const refreshed = await tryRefresh(refreshToken);

    if (refreshed.status === 'ok') {
      const response = NextResponse.next();
      setSessionCookies(response.cookies, { accessToken: refreshed.accessToken });
      return response;
    }

    // API unreachable rather than refused. The refresh token is probably still perfectly
    // good, so the cookies stay: once the backend is back, the next request refreshes
    // silently and the staff member never types a password. They are still sent to /login,
    // because without an access token no page can render — but with an honest reason, so
    // nobody wastes a minute re-entering credentials at a service that is simply down.
    if (refreshed.status === 'unavailable') {
      return redirectToLogin(request, pathname + search, 'unavailable');
    }

    const response = redirectToLogin(request, pathname + search, 'expired');
    clearSessionCookies(response.cookies);
    return response;
  }

  return redirectToLogin(request, pathname + search, 'required');
}

async function tryRefresh(refreshToken) {
  try {
    const response = await fetch(new URL('/auth/refresh', BACKEND_BASE_URL), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refreshToken }),
      cache: 'no-store',
    });

    // A 5xx is the API having a bad time, not a verdict on this session.
    if (response.status >= 500) return { status: 'unavailable' };
    if (!response.ok) return { status: 'rejected' };

    const data = await response.json();
    // The backend returns a new access token only; the refresh token is unchanged and its
    // cookie still has its own, much longer, lifetime.
    return data?.accessToken ? { status: 'ok', accessToken: data.accessToken } : { status: 'rejected' };
  } catch {
    return { status: 'unavailable' };
  }
}

/**
 * Attaches a CSRF token cookie to `response` unless the browser already has one.
 *
 * Reusing an existing token matters more than it looks: minting a fresh one on every /login
 * request would break the staff member who has the login page open in two tabs, because the
 * second tab's token would overwrite the cookie the first tab is holding and the first tab's
 * submit would then fail the double-submit check for no reason they could see.
 */
async function withCsrfToken(request, response) {
  if (request.cookies.get(CSRF_COOKIE)?.value) return response;

  response.cookies.set(CSRF_COOKIE, await createCsrfToken(), csrfCookieOptions());
  return response;
}

function redirectToLogin(request, returnTo, reason) {
  const url = new URL('/login', request.url);
  url.searchParams.set('reason', reason);
  // Only ever an in-app path, and rebuilt against our own origin on use, so it cannot be
  // turned into an open redirect to another site.
  if (returnTo && returnTo !== '/dashboard') url.searchParams.set('next', returnTo);
  return NextResponse.redirect(url);
}

export const config = {
  // Without a matcher the proxy runs on static assets and image requests too, which would
  // put an auth check in front of the stylesheet.
  matcher: ['/dashboard/:path*', '/login'],
};
