import { config } from './config';
import { clearSession, getAccessToken, getRefreshToken, saveSession } from './tokenStorage';
import { SESSION_END_REASONS, emitSessionEnded } from './sessionEvents';

/**
 * The only way the app talks to the backend.
 *
 * Three responsibilities beyond `fetch`:
 *
 *   1. Attach the bearer token, and keep it fresh.
 *   2. Turn the backend's error envelope into a real Error the UI can branch on.
 *   3. Notice when the session has been killed server-side and get the user to the sign-in
 *      screen — the mobile half of the dead-donor lifecycle.
 *
 * ## The dead-donor path, end to end
 *
 * CRM staff ring a donor, cannot reach them, and press "Mark as unreachable". The backend
 * sets `status = DEAD` and increments `User.tokenVersion` (Phase 6). Every access token that
 * donor holds carries the *old* tokenVersion in its payload, so on their very next request
 * `requireAuth` compares the two, finds a mismatch, and answers:
 *
 *     401  { error: { code: "TOKEN_VERSION_MISMATCH", message: "Your session has ended..." } }
 *
 * That is what `handleAuthFailure` below is watching for. It wipes the stored tokens and
 * emits a session-ended event; the root layout routes to the sign-in screen. The donor
 * enters their phone number, receives an OTP, and verifying it flips them DEAD -> ACTIVE
 * (Phase 2) — so re-login is not a punishment, it is the proof-of-life the whole mechanism
 * is asking for.
 *
 * Crucially, a TOKEN_VERSION_MISMATCH is *not* retried through the refresh endpoint. The
 * refresh token carries the same stale tokenVersion and would be rejected too; retrying it
 * would just cost a round-trip before the same sign-out.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Mirrors the backend envelope `{ error: { code, message, fields? } }`, so a screen can say
 *
 *     catch (err) { if (err.code === 'OTP_INVALID') ... ; setFieldErrors(err.fields) }
 *
 * `message` is always safe to show a user: the backend writes them in plain language and
 * never leaks internals (Phase 3 set that convention, Phase 15 enforces it in production).
 */
export class ApiError extends Error {
  constructor({ status, code, message, fields }) {
    super(message || 'Something went wrong.');
    this.name = 'ApiError';
    this.status = status ?? 0;
    this.code = code ?? 'UNKNOWN';
    this.fields = fields ?? null;
  }

  /** True when retrying might work — the phone was in a lift, not the request was wrong. */
  get isNetworkError() {
    return this.code === 'NETWORK_ERROR' || this.code === 'TIMEOUT';
  }
}

function networkError(code, message) {
  return new ApiError({ status: 0, code, message });
}

// ---------------------------------------------------------------------------
// Refresh, single-flight
// ---------------------------------------------------------------------------

/**
 * A screen that fires three requests at once on mount will get three 401s at once. Without
 * this, all three would refresh independently and two of the resulting tokens would be
 * thrown away — and with refresh-token rotation, one of them would invalidate the others.
 * The first caller does the work; the rest await the same promise.
 */
let refreshInFlight = null;

async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    const response = await fetch(`${config.apiBaseUrl}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    await saveSession({
      accessToken: data.accessToken,
      // The endpoint may or may not rotate the refresh token; keep the existing one when it
      // does not.
      refreshToken: data.refreshToken ?? refreshToken,
      user: data.user,
    });
    return data.accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

// ---------------------------------------------------------------------------
// Auth failure handling
// ---------------------------------------------------------------------------

/** Maps a backend auth error code to why the session is over. */
function reasonFor(code) {
  switch (code) {
    case 'TOKEN_VERSION_MISMATCH':
      return SESSION_END_REASONS.TOKEN_VERSION_MISMATCH;
    case 'ACCOUNT_BLOCKED':
      return SESSION_END_REASONS.BLOCKED;
    case 'TOKEN_EXPIRED':
      return SESSION_END_REASONS.EXPIRED;
    default:
      return SESSION_END_REASONS.INVALID;
  }
}

async function endSession(code, message) {
  await clearSession();
  emitSessionEnded({ reason: reasonFor(code), message });
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

async function parseBody(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

async function rawRequest(path, { method = 'GET', body, headers = {}, token, signal } = {}) {
  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);

  // Honour a caller-supplied signal as well as the timeout.
  signal?.addEventListener?.('abort', () => controller.abort());

  try {
    return await fetch(`${config.apiBaseUrl}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        // Let fetch set the multipart boundary itself — setting Content-Type by hand on a
        // FormData body produces a request the server cannot parse.
        ...(isFormData || body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Make a request.
 *
 * @param {string} path      e.g. '/donors/search?bloodGroup=O_POS'
 * @param {object} options
 * @param {boolean} options.auth       attach the stored access token (default true)
 * @param {boolean} options.retryOn401 internal — stops the refresh retry recursing
 */
export async function request(path, options = {}) {
  const { auth = true, retryOn401 = true, ...rest } = options;

  const token = auth ? await getAccessToken() : null;

  let response;
  try {
    response = await rawRequest(path, { ...rest, token });
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw networkError('TIMEOUT', 'The server took too long to respond. Please try again.');
    }
    throw networkError('NETWORK_ERROR', 'Cannot reach Red Express. Check your connection and try again.');
  }

  const payload = await parseBody(response);

  if (response.ok) return payload;

  const code = payload?.error?.code ?? 'UNKNOWN';
  const message = payload?.error?.message ?? `Request failed (${response.status}).`;
  const fields = payload?.error?.fields ?? null;

  // --- the interceptor -----------------------------------------------------

  if (response.status === 401 && auth) {
    // The donor was marked unreachable in the CRM. No refresh is attempted: the refresh
    // token carries the same stale tokenVersion and would be rejected identically.
    if (code === 'TOKEN_VERSION_MISMATCH') {
      await endSession(code, message);
      throw new ApiError({ status: 401, code, message, fields });
    }

    // An ordinary 15-minute expiry. Renew once, silently, and replay the request — the user
    // should never see a spinner turn into a login screen just because they were reading.
    if (retryOn401) {
      const fresh = await refreshAccessToken();
      if (fresh) return request(path, { ...options, retryOn401: false });
    }

    await endSession(code, message);
    throw new ApiError({ status: 401, code, message, fields });
  }

  // BLOCKED is administrative and, unlike DEAD, signing in again does not clear it. The user
  // is still signed out — holding a session that can do nothing is worse than a clear answer.
  if (response.status === 403 && code === 'ACCOUNT_BLOCKED') {
    await endSession(code, message);
    throw new ApiError({ status: 403, code, message, fields });
  }

  throw new ApiError({ status: response.status, code, message, fields });
}

// ---------------------------------------------------------------------------
// Sugar
// ---------------------------------------------------------------------------

export const api = {
  get: (path, options) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options) => request(path, { ...options, method: 'POST', body }),
  patch: (path, body, options) => request(path, { ...options, method: 'PATCH', body }),
  del: (path, options) => request(path, { ...options, method: 'DELETE' }),

  /** Sign out locally. The tokens are simply dropped — there is no server-side session to
   *  end, which is the point of stateless JWTs. */
  async signOut() {
    await clearSession();
    emitSessionEnded({ reason: SESSION_END_REASONS.SIGNED_OUT, message: 'You have been signed out.' });
  },
};

export default api;
