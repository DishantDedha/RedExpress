import { env } from '../config/env.js';
import { maskPhone } from '../utils/phone.js';
import { buildMsg91Request, readMsg91Response } from './msg91Request.js';

/**
 * Provider-agnostic SMS. The rest of the codebase only ever calls
 * sendSms(phone, text, meta); which gateway actually delivers it is an env decision
 * (SMS_PROVIDER).
 *
 * `meta.otp` carries the raw code alongside the rendered text. MSG91's OTP channel takes the
 * code as a parameter rather than parsing it out of a message, and that channel's default
 * template is pre-approved — which is what lets codes reach Indian numbers before DLT
 * registration clears. See msg91Request.js.
 *
 * Adding a provider = write a { name, send } object and register it in `providers`.
 */

const consoleProvider = {
  name: 'console',
  async send(phone, text) {
    // Deliberately prints the full number and body: this provider only runs locally.
    console.log(`\n[sms:console] to ${phone}\n${text}\n`);
    return { provider: 'console', delivered: true };
  },
};

const msg91Provider = {
  name: 'msg91',
  async send(phone, text, { otp } = {}) {
    const { url, init, api } = buildMsg91Request({
      phone,
      text,
      otp,
      config: env.sms.msg91,
      expiryMinutes: env.otp.expiryMinutes,
    });

    const response = await fetch(url, init);
    const payload = await response.json().catch(() => ({}));
    const result = readMsg91Response({ status: response.status, ok: response.ok, payload });

    if (!result.ok) {
      throw new Error(`MSG91 rejected the message for ${maskPhone(phone)}: ${result.reason}`);
    }

    return { provider: 'msg91', api, delivered: true, providerMessageId: result.id };
  },
};

const providers = {
  console: consoleProvider,
  msg91: msg91Provider,
};

export function getSmsProvider() {
  const provider = providers[env.sms.provider];
  if (!provider) {
    throw new Error(
      `Unknown SMS_PROVIDER "${env.sms.provider}". Supported: ${Object.keys(providers).join(', ')}`,
    );
  }
  return provider;
}

/**
 * The one function callers use.
 * Rejects on delivery failure — the OTP flow treats that as a 502 rather than pretending
 * a code was sent, otherwise the user waits forever for a text that never arrives.
 */
export async function sendSms(phone, text, meta = {}) {
  return getSmsProvider().send(phone, text, meta);
}
