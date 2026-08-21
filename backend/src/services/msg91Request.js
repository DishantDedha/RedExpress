/**
 * Building an MSG91 request — pure, so the shape can be tested without a network.
 *
 * MSG91 has two ways to deliver a text, and which one you can use is decided by Indian
 * telecom regulation rather than by preference:
 *
 * **The OTP API** (`/api/v5/otp`) sends through MSG91's own OTP channel. Its default template
 * is pre-approved, so it delivers to Indian numbers **without DLT registration** — which is
 * the difference between shipping today and shipping in three weeks. `otp` is an optional
 * parameter on that endpoint, and passing our own is what keeps this a delivery pipe: the
 * code is still generated here, still stored only as a bcrypt hash, and still verified
 * against `OtpCode` with its attempt ceiling and expiry. MSG91 never decides who is signed in.
 *
 * **The flat SMS API** (`/api/v2/sendsms`) sends arbitrary text under our own sender ID. It
 * needs a DLT-registered header and a content template matching the message character for
 * character, and it is what we move to once that registration clears — because the default
 * template carries no branding and drops the wording written to be read aloud by SMS-reading
 * assistive tech (`otpService.otpMessage`).
 *
 * MSG91_TEMPLATE_ID is the switch. Set it and we use the OTP API; leave it empty and we fall
 * back to flat SMS, which is the DLT path.
 */

const OTP_ENDPOINT = 'https://control.msg91.com/api/v5/otp';
const SMS_ENDPOINT = 'https://api.msg91.com/api/v2/sendsms';

/**
 * @param {object} options
 * @param {string} options.phone       E.164, e.g. +919876543210
 * @param {string} options.text        the rendered message (flat SMS path only)
 * @param {string} [options.otp]       the code itself (OTP API path only)
 * @param {object} options.config      env.sms.msg91
 * @param {number} options.expiryMinutes
 * @returns {{ url: string, init: RequestInit, api: 'otp'|'sms' }}
 */
export function buildMsg91Request({ phone, text, otp, config, expiryMinutes }) {
  const { authKey, senderId, templateId, route } = config;

  if (!authKey) {
    throw new Error('SMS_PROVIDER=msg91 but MSG91_AUTH_KEY is not set.');
  }

  // MSG91 wants the number with its country code but without the leading +.
  const mobile = phone.replace(/^\+/, '');

  if (templateId) {
    const url = new URL(OTP_ENDPOINT);
    url.searchParams.set('template_id', templateId);
    url.searchParams.set('mobile', mobile);
    // Our code, not theirs. Without this MSG91 generates one and the user receives a code
    // that could never match the hash stored here.
    if (otp) url.searchParams.set('otp', otp);
    url.searchParams.set('otp_expiry', String(expiryMinutes));

    return {
      api: 'otp',
      url: url.toString(),
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', authkey: authKey },
        // Variables for templates that declare them. The default template declares none.
        body: JSON.stringify({}),
      },
    };
  }

  if (!senderId) {
    throw new Error(
      'SMS_PROVIDER=msg91 with no MSG91_TEMPLATE_ID falls back to flat SMS, which needs MSG91_SENDER_ID (and a DLT-registered header).',
    );
  }

  return {
    api: 'sms',
    url: SMS_ENDPOINT,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({
        sender: senderId,
        route,
        country: '0', // numbers are already E.164, so let MSG91 read the code from the number
        sms: [{ message: text, to: [mobile] }],
      }),
    },
  };
}

/**
 * MSG91 answers 200 with `{"type":"error"}` for a rejected message as readily as it does for
 * a delivered one, so the HTTP status alone is not the answer.
 *
 * @returns {{ ok: true, id?: string } | { ok: false, reason: string }}
 */
export function readMsg91Response({ status, ok, payload }) {
  if (!ok) {
    return { ok: false, reason: payload?.message ?? `HTTP ${status}` };
  }
  if (payload?.type === 'error') {
    return { ok: false, reason: payload?.message ?? 'MSG91 reported an error with no message' };
  }
  return { ok: true, id: typeof payload?.message === 'string' ? payload.message : undefined };
}
