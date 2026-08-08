/**
 * CSRF protection for the CRM's route handlers.
 *
 * ## What is already protected, and what is not
 *
 * Next compares the `Origin` against the `Host` on every **Server Action**, so the three
 * mutations in lib/actions/crm.js — record a call, mark a donor dead, reactivate them — are
 * covered by the framework. Nothing in this file is needed for them.
 *
 * **Route handlers get no such check.** `/api/auth/login` and `/api/auth/logout` are ordinary
 * POST endpoints, and without something here any page on the internet could post to them from
 * a staff member's browser. Two concrete attacks, neither hypothetical:
 *
 *   - *Login CSRF.* An attacker submits their own credentials from a page the staff member is
 *     visiting. The victim is now silently signed in as the attacker, and every call they log
 *     and every donor they mark unreachable is written against the attacker's account — the
 *     audit trail then names the wrong person for actions that end a donor's session.
 *   - *Forced logout.* A nuisance rather than a breach, but signing a staff member out in the
 *     middle of a forty-name calling list during an emergency is a real cost.
 *
 * ## Two independent checks
 *
 * **1. Origin against Host.** The same rule Next applies to Server Actions. A browser sets
 * `Origin` on every cross-site POST and page scripts cannot forge it, so this alone stops the
 * ordinary attack. It is stateless and runs first.
 *
 * **2. A signed double-submit token.** The token is delivered in a `SameSite=Lax` cookie and
 * must be echoed back in the `x-csrf-token` header. A cross-site POST never carries a Lax
 * cookie, so an attacker has no way to read the value they would need to echo.
 *
 * The token is HMAC-signed with `CRM_SESSION_SECRET` rather than being a bare random string,
 * which is what makes it survive the case double-submit is usually criticised for: an attacker
 * controlling a sibling subdomain can *write* a cookie onto this host and would otherwise be
 * able to plant a value they know and echo it. They cannot produce the signature.
 *
 * Either check alone stops the ordinary attack. Both are here because the cost is one header
 * and the failure mode is somebody's session.
 *
 * ## Why Web Crypto and not `node:crypto`
 *
 * `proxy.js` mints the token, and the proxy may run at an edge location where Node's `crypto`
 * module does not exist. `crypto.subtle` is global in both the Edge and Node runtimes, so one
 * implementation serves the proxy and the route handlers. That is also why every function
 * below is async.
 */

// The names live with the other cookie names so the client form can import them without
// pulling this module — and its signing key lookup — into the browser bundle.
import { CSRF_COOKIE, CSRF_HEADER } from './session-cookies';

export { CSRF_COOKIE, CSRF_HEADER };

/** Tokens are minted per visit to the login page; a day is far longer than anyone needs. */
export const CSRF_MAX_AGE_SECONDS = 24 * 60 * 60;

/**
 * A per-process key used only when CRM_SESSION_SECRET is unset outside production. A restart
 * then invalidates outstanding tokens, which shows up as one failed submit and a reload —
 * not as a security hole, and not as a constant baked into the repository.
 */
let developmentSecret = null;

function secret() {
  const configured = process.env.CRM_SESSION_SECRET;
  if (configured) return configured;

  if (process.env.NODE_ENV === 'production') {
    // A token signed with a key that ships in the source is not signed at all.
    throw new Error('CRM_SESSION_SECRET is not set. See the [crm] section of .env.example.');
  }

  developmentSecret ??= base64url(crypto.getRandomValues(new Uint8Array(32)));
  return developmentSecret;
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const encoder = new TextEncoder();

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function sign(nonce) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(nonce));
  return base64url(new Uint8Array(mac));
}

/**
 * Constant-time string comparison.
 *
 * `===` on a MAC returns as soon as two bytes differ, and the timing difference is enough to
 * recover the expected value one byte at a time. Node's `timingSafeEqual` is not available in
 * the Edge runtime, so this is the portable equivalent: always walk the full length, and fold
 * the length difference into the result rather than returning early on it.
 */
function equals(a, b) {
  const left = encoder.encode(String(a));
  const right = encoder.encode(String(b));

  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let i = 0; i < length; i += 1) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

/** A fresh token, shaped `<nonce>.<hmac>`. */
export async function createCsrfToken() {
  const nonce = base64url(crypto.getRandomValues(new Uint8Array(18)));
  return `${nonce}.${await sign(nonce)}`;
}

/** True when `token` is well-formed and carries our signature. */
export async function isValidCsrfToken(token) {
  if (typeof token !== 'string') return false;
  const [nonce, mac, ...rest] = token.split('.');
  if (!nonce || !mac || rest.length) return false;
  return equals(mac, await sign(nonce));
}

/** Cookie options for the CSRF token. */
export function csrfCookieOptions() {
  return {
    // NOT httpOnly, deliberately: the login form has to read this to echo it back, which is
    // the whole mechanism. It is not a credential — holding it grants nothing without the
    // session cookie, which is httpOnly and stays unreadable.
    httpOnly: false,
    // Lax is what makes the double submit work: the cookie is simply not sent on a
    // cross-site POST, so the attacker's request arrives with nothing to match against.
    sameSite: 'lax',
    secure: process.env.CRM_COOKIE_SECURE === 'true',
    path: '/',
    maxAge: CSRF_MAX_AGE_SECONDS,
  };
}

// ---------------------------------------------------------------------------
// The check
// ---------------------------------------------------------------------------

/**
 * Compares the request's Origin to the host it was sent to.
 *
 * `X-Forwarded-Host` wins when present: behind a proxy the `Host` header is the internal name
 * and would never match the public origin the browser saw. That header is only trustworthy
 * because our own proxy sets it — the same assumption `TRUST_PROXY` encodes on the backend,
 * and the reason both are configuration rather than defaults.
 *
 * A request with no `Origin` at all passes this check: browsers always send it on a cross-site
 * POST, so its absence means a non-browser client, which is not what CSRF describes. The token
 * check is what covers those.
 */
function originMatchesHost(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return false;

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Verifies a mutating route-handler request.
 *
 * @returns {Promise<{ ok: true } | { ok: false, reason: string }>}
 */
export async function checkCsrf(request) {
  if (!originMatchesHost(request)) {
    return { ok: false, reason: 'This request did not come from the Red Express dashboard.' };
  }

  const header = request.headers.get(CSRF_HEADER);
  const cookie = request.cookies?.get(CSRF_COOKIE)?.value;

  if (!header || !cookie) {
    return { ok: false, reason: 'Your page has expired. Reload and try again.' };
  }

  // Double submit: the header must equal the cookie…
  if (!equals(header, cookie)) {
    return { ok: false, reason: 'Your page has expired. Reload and try again.' };
  }

  // …and the value must be one we minted, so a cookie planted by a sibling subdomain is not
  // a token an attacker can also put in the header.
  if (!(await isValidCsrfToken(header))) {
    return { ok: false, reason: 'Your page has expired. Reload and try again.' };
  }

  return { ok: true };
}
