import { api } from './apiClient';
import { logger } from './logger';
import { getAccessToken, getCachedUser, getRefreshToken, saveSession } from './tokenStorage';
import {
  sendOtp as sendWidgetOtp,
  verifyOtp as verifyWidgetOtp,
  widgetAvailable,
} from './otpWidget';

/**
 * Phones for which the widget has already failed once this session.
 *
 * `widgetAvailable()` only says the package and credentials are present — it says nothing
 * about whether MSG91's SDK can actually complete a send right now. It cannot: on some Jio
 * connections the SDK attempts carrier-network "invisible" verification over plain HTTP to
 * `partnerapi.jio.com`, which Android refuses outright (cleartext is blocked by default since
 * API 28), and the thrown exception reaches here as a raw, unrecoverable rejection — not the
 * graceful fallback-to-SMS their own docs describe. Without this set, that exception would
 * reach the phone screen as a wall of Java, with the backend's own OTP path — the one
 * OTP_MASTER_CODE exists to keep working — sitting right there unused.
 *
 * Scoped to the phone, not the whole session, because a MSG91 outage should not quietly take
 * down sign-in for a number the widget could actually reach. Cleared on app restart; there is
 * no reason to remember a failure past that.
 */
const widgetFallbackPhones = new Set();

function useWidgetFor(phone) {
  return widgetAvailable() && !widgetFallbackPhones.has(phone);
}

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
export async function requestOtp(phone) {
  if (useWidgetFor(phone)) {
    try {
      // The number is already normalised by the caller, and MSG91 has no opinion to return
      // about it, so it is echoed back unchanged — the screens rely on this field either way.
      const { expiresInSeconds } = await sendWidgetOtp(phone);
      return { phone, expiresInSeconds };
    } catch (error) {
      // Recorded before falling back, so verifyOtp checks this code the same way it was
      // sent — never against MSG91, which never generated it.
      widgetFallbackPhones.add(phone);
      logger.warn('[auth] MSG91 widget send failed; falling back to the backend OTP', error?.message);
    }
  }

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
export async function verifyOtp({ phone, code, role = 'DONOR', mode = 'reactivate' }) {
  // Two ways in, one result. On the widget path MSG91 checks the code and the backend trades
  // the resulting token for a session; on the fallback path the backend checks the code
  // itself. Both endpoints return the same payload, so nothing below this line differs — and
  // neither does anything in the screens that call it.
  //
  // useWidgetFor, not widgetAvailable — the code in the user's hand was sent by whichever
  // path actually succeeded, which requestOtp may have downgraded for this phone after the
  // widget failed. Checking config presence alone here would mean asking MSG91 to verify a
  // code its own SDK never sent.
  const result = useWidgetFor(phone)
    ? await api.post(
        '/auth/otp/widget-verify',
        // No phone number: the backend reads it from MSG91's verification of the token, and
        // would ignore one sent here. See backend/src/services/msg91Widget.js.
        { accessToken: await verifyWidgetOtp(phone, code), role },
        { auth: false },
      )
    : await api.post('/auth/otp/verify', { phone, code, role }, { auth: false });

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
 * A completed profile with no password (`passwordSet: false`) is the other case OTP alone
 * cannot finish signing in: an account that predates the password requirement, or one
 * recovering a forgotten password. It goes to `/set-password` rather than `/home` because
 * password is now the only everyday way back in — leaving without setting one would strand
 * them at the next sign-in.
 *
 * The awkward case is someone who registers and is new, and therefore has no role of their
 * own yet — this only reaches here via `mode === 'register'`, so `role` is always known too.
 */
function routeAfterVerify({ profileComplete, isNewUser, passwordSet, user, mode, role }) {
  if (mode === 'register' && role) {
    return role === 'RECEIVER' ? '/receiver-form' : '/donor-form';
  }

  if (!profileComplete) {
    // Reached e.g. by "Login" against a number Red Express has never seen — the account was
    // just created by the OTP verify above, but nobody has chosen donor vs. receiver yet.
    if (isNewUser) return '/register';
    return user?.role === 'RECEIVER' ? '/receiver-form' : '/donor-form';
  }

  if (!passwordSet) return '/set-password';

  return '/home';
}

/**
 * Sign-in with phone + password — the everyday way in now that OTP is reserved for proving a
 * phone number rather than for signing in itself.
 *
 * Three outcomes the login screen has to branch on come back as `error.code`, not as this
 * function's return value, because they are not "signed in": `PHONE_REVERIFICATION_REQUIRED`
 * (the account was marked unreachable and needs an OTP re-verify), `PASSWORD_NOT_SET` (a
 * pre-password account, or a genuinely forgotten one — same fix, verify and set a new one),
 * and the plain `INVALID_CREDENTIALS` wrong-phone-or-password case.
 */
export async function loginWithPassword({ phone, password }) {
  const result = await api.post('/auth/login', { phone, password }, { auth: false });

  await saveSession({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    user: result.user,
  });

  return result;
}

/**
 * Sets the password on the current session's account — the second half of both the
 * "never had one" and "forgot it" paths, once an OTP has freshly verified the phone. The
 * cached user is refreshed so a stale `hasPassword` flag never lingers.
 */
export async function setPassword({ password, confirmPassword }) {
  const result = await api.post('/auth/password/set', { password, confirmPassword });
  await saveSession({
    accessToken: await getAccessToken(),
    refreshToken: await getRefreshToken(),
    user: result.user,
  });
  return result;
}

/** The signed-in user as last seen, without a network call. Null when signed out. */
export function getStoredUser() {
  return getCachedUser();
}
