import { api } from './apiClient';
import { getCachedUser, saveSession } from './tokenStorage';

/**
 * The auth calls, in one place.
 *
 * Screens do not talk to `api` directly for sign-in, because two things must happen together
 * and neither is optional: the tokens have to reach secure storage, and the caller has to be
 * told where the user should land. Leaving that to each screen is how a half-signed-in state
 * gets shipped.
 *
 * Both endpoints are called with `auth: false`. There is no token yet, and sending a stale
 * one from a previous session would make `apiClient` try to refresh it mid sign-in.
 */

/**
 * Asks the backend to text a code.
 *
 * The response carries the number back in normalised E.164 form. That is what gets passed to
 * the verify screen — not what the user typed — so the two calls cannot disagree about which
 * number is being verified.
 *
 * @returns {Promise<{ phone, maskedPhone, expiresAt, expiresInSeconds, message, devCode? }>}
 *          `devCode` is only present when SMS_PROVIDER=console on a non-production backend.
 */
export function requestOtp(phone) {
  return api.post('/auth/otp/request', { phone }, { auth: false });
}

/**
 * Verifies the code, stores the session, and reports where to go next.
 *
 * `role` only matters when the account is being created — the backend keeps an existing
 * user's role, so a donor who happens to come in through the "Find blood" entry point is not
 * silently turned into a receiver.
 *
 * @returns the backend payload plus `next`, the route to land on.
 */
export async function verifyOtp({ phone, code, role = 'DONOR', mode = 'login' }) {
  const result = await api.post('/auth/otp/verify', { phone, code, role }, { auth: false });

  await saveSession({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: result.user,
  });

  return { ...result, next: routeAfterVerify({ ...result, mode, role }) };
}

/**
 * Where a freshly verified user belongs.
 *
 * `profileComplete` comes from the backend and is the only reliable signal — an account can
 * exist with nothing but a phone number on it, because verifying an OTP creates the user
 * before any form is filled in. Sending someone with a bare account to the home screen would
 * show them an empty shell.
 *
 * The awkward case is someone who taps "Login", is new, and therefore has no role of their
 * own yet. They are sent to the type chooser rather than being guessed at: the account has
 * been created as a donor by default, and quietly committing them to that is worse than
 * asking. `/register` detects the live session and goes straight to the right form.
 */
function routeAfterVerify({ profileComplete, isNewUser, user, mode, role }) {
  if (profileComplete) return '/home';

  if (mode === 'register' && role) {
    return role === 'RECEIVER' ? '/receiver-form' : '/donor-form';
  }

  if (isNewUser) return '/register';

  return user?.role === 'RECEIVER' ? '/receiver-form' : '/donor-form';
}

/** The signed-in user as last seen, without a network call. Null when signed out. */
export function getStoredUser() {
  return getCachedUser();
}
