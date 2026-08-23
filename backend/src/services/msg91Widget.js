import { env } from '../config/env.js';

/**
 * Verifying an MSG91 OTP-widget access token.
 *
 * ## Why this exists at all
 *
 * Sending our own SMS through MSG91 requires a DLT-registered header and an approved content
 * template — weeks of paperwork with an Indian telecom regulator. The OTP widget sidesteps it:
 * MSG91 sends the code from *their* pre-approved sender, the app collects it, and MSG91 hands
 * back a signed access token proving the number was verified. This module is the server half —
 * we ask MSG91 whether a token is genuine and which number it belongs to.
 *
 * ## What we give up, and what we keep
 *
 * Given up: the code itself. MSG91 generates and checks it, so `OtpCode`, the bcrypt hashing,
 * the five-attempt ceiling and the per-phone request limit are all bypassed on this path. Their
 * widget settings enforce expiry and resend timing instead.
 *
 * Kept: everything that matters afterwards. The BLOCKED check, the STAFF-must-use-password
 * rule, the account upsert and the DEAD -> ACTIVE revival all run exactly as they did, because
 * they were never part of verification — see authService.finishPhoneLogin.
 *
 * ## The rule this file exists to enforce
 *
 * **The phone number comes from MSG91's response and from nowhere else.** If we accepted a
 * number the client sent alongside the token, anyone could verify their own phone, then post
 * that token with a donor's number and be signed in as them. The token is the only evidence,
 * and MSG91 is the only party that can say what it means.
 */

const VERIFY_ENDPOINT = 'https://control.msg91.com/api/v5/widget/verifyAccessToken';

/**
 * @param {object} options
 * @param {string} options.accessToken  the JWT the widget returned to the app
 * @param {string} options.authKey      MSG91_AUTH_KEY — server-side only, never in the bundle
 * @returns {{ url: string, init: RequestInit }}
 */
export function buildVerifyRequest({ accessToken, authKey }) {
  if (!authKey) {
    throw new Error('MSG91_AUTH_KEY is not set, so widget tokens cannot be verified.');
  }
  if (!accessToken || typeof accessToken !== 'string') {
    throw new Error('An access token is required.');
  }

  return {
    url: VERIFY_ENDPOINT,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      // The hyphen in `access-token` is MSG91's spelling, not a typo.
      body: JSON.stringify({ authkey: authKey, 'access-token': accessToken }),
    },
  };
}

/**
 * Turns MSG91's answer into a verdict.
 *
 * They answer 200 for a rejected token as readily as for a good one, so the status code alone
 * would let a forged token through. `type` is the field that decides.
 *
 * @returns {{ ok: true, identifier: string } | { ok: false, reason: string }}
 */
export function readVerifyResponse({ ok, status, payload }) {
  if (!ok) {
    return { ok: false, reason: payload?.message ?? `HTTP ${status}` };
  }

  if (payload?.type !== 'success') {
    return { ok: false, reason: payload?.message ?? 'MSG91 rejected the token with no reason given' };
  }

  // On success `message` carries the verified identifier — the phone number the user proved
  // they control.
  const identifier = typeof payload.message === 'string' ? payload.message.trim() : '';
  if (!identifier) {
    return { ok: false, reason: 'MSG91 accepted the token but returned no phone number' };
  }

  return { ok: true, identifier };
}

/**
 * MSG91 returns the number without a leading `+` (`919876543210`). Left as-is it would reach
 * libphonenumber as a national number and be parsed against DEFAULT_PHONE_REGION, which for a
 * twelve-digit string beginning `91` produces either the wrong country or nothing at all.
 */
export function toE164(identifier) {
  const trimmed = identifier.trim();
  if (trimmed.startsWith('+')) return trimmed;
  if (/^\d{7,15}$/.test(trimmed)) return `+${trimmed}`;
  return trimmed; // let normalizePhone reject it with its own message
}

/**
 * Asks MSG91 whether this token is real.
 *
 * @param {string} accessToken
 * @returns {Promise<string>} the verified number in E.164
 * @throws {Error} when the token is rejected or MSG91 is unreachable
 */
export async function verifyWidgetToken(accessToken) {
  const { url, init } = buildVerifyRequest({
    accessToken,
    authKey: env.sms.msg91.authKey,
  });

  const response = await fetch(url, init);
  const payload = await response.json().catch(() => ({}));
  const result = readVerifyResponse({ ok: response.ok, status: response.status, payload });

  if (!result.ok) {
    throw new Error(result.reason);
  }

  return toE164(result.identifier);
}
