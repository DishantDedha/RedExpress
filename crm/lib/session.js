import { cache } from 'react';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { backendFetch, BackendError } from './api';
import { ACCESS_COOKIE } from './session-cookies';

/**
 * Server-side session access.
 *
 * `getSession()` is wrapped in React's `cache()`, so the layout, the topbar and any page that
 * asks during the same request all share one `/auth/session` call rather than hitting the
 * backend three times per page view.
 *
 * The session is verified by the backend on every request — deliberately. The cookie could be
 * decoded locally, but that would trust a token the backend may have already invalidated. The
 * whole tokenVersion mechanism (docs/auth.md) exists so that a revoked session dies at the
 * next call; short-circuiting it here would reintroduce exactly the stale-session problem it
 * was built to solve. A staff account that gets blocked mid-shift is logged out on their next
 * click, not whenever their token happens to expire.
 */

export async function getAccessToken() {
  const store = await cookies();
  return store.get(ACCESS_COOKIE)?.value ?? null;
}

export const getSession = cache(async () => {
  const token = await getAccessToken();
  if (!token) return null;

  try {
    const { user } = await backendFetch('/auth/session', { token });
    // Belt and braces: /crm is staff-only on the backend, but a donor token must never render
    // a dashboard shell either, even an empty one.
    if (user.role !== 'STAFF' && user.role !== 'ADMIN') return null;
    return user;
  } catch (error) {
    if (error instanceof BackendError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
});

/**
 * For pages and layouts that cannot render without a signed-in staff member.
 * Redirects instead of returning null, so callers can use the result directly.
 */
export async function requireSession() {
  const user = await getSession();
  if (!user) redirect('/login?reason=expired');
  return user;
}

/**
 * The server-component data helper: authenticated GET against the backend.
 *
 * A 401 here means the session died between the layout's check and this call (staff account
 * blocked, secrets rotated). Bouncing to /login is the honest response; showing an error card
 * that says "unauthorised" and leaving them on the page is not.
 */
export async function apiGet(path, query) {
  const token = await getAccessToken();
  if (!token) redirect('/login?reason=expired');

  try {
    return await backendFetch(path, { token, query });
  } catch (error) {
    if (error instanceof BackendError && error.isAuthFailure) redirect('/login?reason=expired');
    throw error;
  }
}

/**
 * The write counterpart, for server actions.
 *
 * Unlike `apiGet` this does **not** swallow failures into a redirect or an error page. A
 * mutation that fails has to report back to the control the staff member pressed — "no answer
 * was not recorded" belongs in a toast beside the button, not on a full-page error screen that
 * loses their place in a worklist. So everything except a dead session comes back as a thrown
 * BackendError for the action to turn into a message.
 *
 * A 401 is still a redirect: there is nothing useful to say to someone whose session ended
 * except "sign in again".
 */
export async function apiSend(path, { method = 'POST', body } = {}) {
  const token = await getAccessToken();
  if (!token) redirect('/login?reason=expired');

  try {
    return await backendFetch(path, { token, method, body });
  } catch (error) {
    if (error instanceof BackendError && error.isAuthFailure) redirect('/login?reason=expired');
    throw error;
  }
}
