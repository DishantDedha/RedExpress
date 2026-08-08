/**
 * Session cookie names, options, and the JWT expiry reader.
 *
 * This module is imported by `proxy.js`, so it must stay dependency-free and runtime-neutral:
 * no `next/headers`, no Node built-ins, nothing that only exists in a server component.
 * `atob` is available in both the Node and Edge runtimes.
 *
 * ## Why cookies at all
 *
 * The backend hands out a bearer access token and a refresh token. If the browser held them
 * they would sit in JavaScript-readable storage, one XSS away from an attacker who could then
 * read every donor's phone number and address. Instead the token exchange happens in a Next
 * route handler and the tokens go into httpOnly cookies: the browser sends them, client code
 * cannot read them.
 */

export const ACCESS_COOKIE = 're_access';
export const REFRESH_COOKIE = 're_refresh';

/** Where the browser should be sent back to after signing in. Short-lived, not sensitive. */
export const RETURN_TO_COOKIE = 're_return_to';

/**
 * The CSRF token's cookie and header names.
 *
 * They live here, with the other cookie names, rather than in `lib/csrf.js`, because the
 * login form is a client component and needs both — and importing the crypto module to get
 * two strings would drag the signing code into the browser bundle. The logic stays in
 * `lib/csrf.js`; only the names are shared. Same reasoning that keeps this whole file
 * dependency-free for `proxy.js`.
 */
export const CSRF_COOKIE = 're_csrf';
export const CSRF_HEADER = 'x-csrf-token';

/**
 * `secure` is driven by env rather than NODE_ENV: the CRM may legitimately run a production
 * build over plain http on an internal host during a pilot, and a Secure cookie would simply
 * never be sent, producing a login loop that looks like a bug in auth.
 */
export const cookieSecure = process.env.CRM_COOKIE_SECURE === 'true';

export function baseCookieOptions() {
  return {
    httpOnly: true,
    // 'lax' still sends the cookie on top-level navigation (so a bookmarked /dashboard link
    // works) but not on cross-site POSTs. Phase 15 adds the CSRF token on top of this.
    sameSite: 'lax',
    secure: cookieSecure,
    path: '/',
  };
}

/**
 * Reads `exp` out of a JWT without verifying it.
 *
 * Verification is the backend's job — it owns the secret, and it re-checks the signature and
 * the tokenVersion on every call. All the CRM needs is "when does this stop being useful",
 * so it knows how long to keep the cookie. Treating the value as untrusted is fine because
 * the worst a forged `exp` can do is make us throw away a token early.
 *
 * @returns {number|null} Unix seconds, or null if the token is not a readable JWT.
 */
export function readJwtExpiry(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;

    // JWTs are base64url; atob wants plain base64.
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = JSON.parse(atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')));

    return typeof json.exp === 'number' ? json.exp : null;
  } catch {
    return null;
  }
}

/**
 * Cookie lifetime for a token, in seconds.
 *
 * The access cookie is deliberately set to expire slightly *before* the token does. When it
 * disappears the proxy sees "no access cookie, but a refresh cookie" and silently mints a new
 * one — which is far better than sending a token the backend will reject and bouncing the
 * staff member to /login mid-task.
 */
export function cookieMaxAge(token, { skewSeconds = 30, fallbackSeconds } = {}) {
  const exp = readJwtExpiry(token);
  if (exp === null) return fallbackSeconds;

  const seconds = Math.floor(exp - Date.now() / 1000 - skewSeconds);
  return seconds > 0 ? seconds : 0;
}

/** Applies the session cookies to any object with a `.set(name, value, options)` cookie store. */
export function setSessionCookies(store, { accessToken, refreshToken }) {
  const options = baseCookieOptions();

  if (accessToken) {
    store.set(ACCESS_COOKIE, accessToken, {
      ...options,
      maxAge: cookieMaxAge(accessToken, { fallbackSeconds: 15 * 60 }),
    });
  }

  if (refreshToken) {
    store.set(REFRESH_COOKIE, refreshToken, {
      ...options,
      maxAge: cookieMaxAge(refreshToken, { fallbackSeconds: 30 * 24 * 60 * 60 }),
    });
  }
}

/** Removes both cookies. Used on logout and whenever the backend disowns a session. */
export function clearSessionCookies(store) {
  const options = { ...baseCookieOptions(), maxAge: 0 };
  store.set(ACCESS_COOKIE, '', options);
  store.set(REFRESH_COOKIE, '', options);
}
