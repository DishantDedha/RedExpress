/**
 * The one place the CRM talks to the Red Express backend.
 *
 * Every call happens on the server — in a route handler, a server action, or a server
 * component. The browser never holds an access token and never issues a cross-origin request
 * to the API, which is why the backend's CORS allow-list only needs to know about the CRM's
 * origin for the odd asset, not for data.
 *
 * The backend answers every failure with the same envelope:
 *   { error: { code, message, fields? } }
 * so this module turns that into one `BackendError` the UI can switch on.
 */

/** Server-side base URL. Unprefixed on purpose — a NEXT_PUBLIC_ name would ship to the browser. */
export const BACKEND_BASE_URL = process.env.BACKEND_API_BASE_URL ?? 'http://localhost:4000';

export class BackendError extends Error {
  constructor(status, code, message, fields) {
    super(message);
    this.name = 'BackendError';
    this.status = status;
    this.code = code;
    this.fields = fields;
  }

  /** True when the backend is telling us this session is finished, not that the input was bad. */
  get isAuthFailure() {
    return this.status === 401;
  }
}

/**
 * Calls the backend and returns parsed JSON, or throws BackendError.
 *
 * @param {string} path      Path beginning with '/', e.g. '/crm/stats'.
 * @param {object} [options]
 * @param {string} [options.method]
 * @param {any}    [options.body]   Serialised as JSON unless it is already FormData.
 * @param {string} [options.token]  Bearer access token.
 * @param {object} [options.query]  Appended as a query string, skipping undefined/empty values.
 * @param {string} [options.cache]  Fetch cache mode. Defaults to 'no-store' — this dashboard
 *                                  shows who is reachable *right now*; a cached donor list is
 *                                  a wasted phone call.
 */
export async function backendFetch(path, options = {}) {
  const { method = 'GET', body, token, query, cache = 'no-store', signal } = options;

  const url = new URL(path, BACKEND_BASE_URL);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !isFormData) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
      cache,
      signal,
    });
  } catch (cause) {
    // The API being down is an operational problem, not a user error — say so plainly rather
    // than letting a raw ECONNREFUSED reach a staff member.
    const error = new BackendError(
      503,
      'BACKEND_UNREACHABLE',
      'Cannot reach the Red Express API. Try again in a moment.',
    );
    error.cause = cause;
    throw error;
  }

  if (response.status === 204) return null;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new BackendError(
      response.status,
      error.code ?? 'UNKNOWN_ERROR',
      error.message ?? 'Something went wrong.',
      error.fields,
    );
  }

  return payload;
}
