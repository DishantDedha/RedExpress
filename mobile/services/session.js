import { api } from './apiClient';
import { unregisterPush } from './push';

/**
 * Signing out, in the right order.
 *
 * The push token has to be handed back *before* the tokens are cleared, because
 * `DELETE /devices/:token` needs a valid access token to prove the device belongs to the
 * caller. Clearing first would leave this phone registered to an account that has left it —
 * on a shared device, the next blood request would arrive as a stranger's emergency on
 * someone else's lock screen.
 *
 * This is deliberately not part of `api.signOut()`. That path is also taken by a *forced*
 * sign-out (a donor marked unreachable in the CRM), where the token is already rejected and
 * the unregister call could only fail — see `apiClient.js`. Those users keep their device
 * registration, which is harmless: a DEAD donor is excluded from matching, so nothing is
 * ever sent to it, and their next sign-in re-points the row at them.
 */
export async function signOut() {
  // Never throws, so a network failure cannot strand the user on a screen that says they
  // are signed out when they are not.
  await unregisterPush();
  await api.signOut();
}
