import { Platform } from 'react-native';
import { logger } from './logger';

/**
 * Public runtime configuration, read from `mobile/.env` (see the `[mobile]` block of the
 * root `.env.example`).
 *
 * Only `EXPO_PUBLIC_*` variables reach the bundle, and everything that does is readable by
 * anyone who has the app — these are public values, not secrets. Nothing here is inlined at
 * build time by accident: Expo replaces `process.env.EXPO_PUBLIC_X` literally, which is why
 * each one is written out in full rather than looked up dynamically.
 */

function required(value, name, fallback) {
  if (value) return value;
  logger.warn(`[config] ${name} is not set; falling back to ${fallback}. See mobile/README.md.`);
  return fallback;
}

/**
 * `localhost` means the phone itself, so it only works in a simulator. A physical device
 * needs the machine's LAN IP and the Android emulator needs 10.2.2 — the guess below is a
 * development convenience, and EXPO_PUBLIC_API_BASE_URL should be set properly.
 */
const devFallbackBaseUrl = Platform.select({
  android: 'http://10.0.2.2:4000',
  default: 'http://localhost:4000',
});

export const config = {
  apiBaseUrl: required(
    process.env.EXPO_PUBLIC_API_BASE_URL,
    'EXPO_PUBLIC_API_BASE_URL',
    devFallbackBaseUrl,
  ).replace(/\/+$/, ''),

  // Needed by expo-notifications to mint a push token (Phase 10).
  projectId: process.env.EXPO_PUBLIC_PROJECT_ID || null,

  // Shown on the privacy screen and behind the registration form's terms checkbox. Null
  // rather than a placeholder URL when unset: the privacy screen says the document is not in
  // this build and offers the support address, which is honest, where a dead link is not.
  supportEmail: process.env.EXPO_PUBLIC_SUPPORT_EMAIL || 'support@redexpress.local',
  privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL || null,
  termsUrl: process.env.EXPO_PUBLIC_TERMS_URL || null,

  // Phase 11's voice-input experiment. Off unless explicitly enabled, because it needs a
  // dev build and does not run in Expo Go.
  enableVoiceInput: process.env.EXPO_PUBLIC_ENABLE_VOICE_INPUT === 'true',

  /** How long to wait on a request before giving up. Emergency use — a spinner that never
   *  resolves is worse than a clear failure the user can retry. */
  requestTimeoutMs: 15000,
};

export default config;
