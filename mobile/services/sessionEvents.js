/**
 * A one-event bus: "the session ended, send the user to sign in".
 *
 * The API client is the thing that discovers a session has died — it is the only code that
 * sees the 401. But it must not navigate: it is a plain module, not a component, so it has
 * no router, and importing one would tie every network call to the navigation tree and make
 * the client untestable.
 *
 * So the client publishes here and the root layout subscribes and navigates. See
 * `apiClient.js` for why this fires, and `docs/auth.md` in the backend for the
 * tokenVersion mechanism behind it.
 */

import { logger } from './logger';

const listeners = new Set();

/**
 * @param {(event: { reason: string, message: string }) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onSessionEnded(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSessionEnded(event) {
  for (const listener of [...listeners]) {
    try {
      listener(event);
    } catch (error) {
      // One bad subscriber must not stop the others from signing the user out.
      logger.warn('[sessionEvents] listener threw', error);
    }
  }
}

/** Why a session ended. Drives the message the user is shown on the login screen. */
export const SESSION_END_REASONS = {
  /**
   * The backend rejected the token because its tokenVersion no longer matches the user's.
   * In practice this means CRM staff marked the donor unreachable (Phase 6) after failing to
   * reach them by phone. Re-verifying by OTP sets them back to ACTIVE — the sign-in screen
   * is not a dead end, it is the way back.
   */
  TOKEN_VERSION_MISMATCH: 'TOKEN_VERSION_MISMATCH',
  /** The 15-minute access token expired and the refresh token could not renew it. */
  EXPIRED: 'EXPIRED',
  /** Malformed, tampered with, or signed with a rotated secret. */
  INVALID: 'INVALID',
  /** Administratively blocked. Unlike DEAD, the user cannot fix this by signing in. */
  BLOCKED: 'BLOCKED',
  /** The user tapped sign out. */
  SIGNED_OUT: 'SIGNED_OUT',
};
