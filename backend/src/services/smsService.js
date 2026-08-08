import { env } from '../config/env.js';
import { maskPhone } from '../utils/phone.js';

/**
 * Provider-agnostic SMS. The rest of the codebase only ever calls sendSms(phone, text);
 * which gateway actually delivers it is an env decision (SMS_PROVIDER).
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
  async send(phone, text) {
    const { authKey, senderId, route } = env.sms.msg91;
    if (!authKey || !senderId) {
      throw new Error('SMS_PROVIDER=msg91 but MSG91_AUTH_KEY / MSG91_SENDER_ID are not set.');
    }

    // MSG91's flat SMS API wants the number without the leading +.
    const mobiles = phone.replace(/^\+/, '');

    const response = await fetch('https://api.msg91.com/api/v2/sendsms', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', authkey: authKey },
      body: JSON.stringify({
        sender: senderId,
        route,
        country: '0', // numbers are already E.164, so let MSG91 read the code from the number
        sms: [{ message: text, to: [mobiles] }],
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok || payload?.type === 'error') {
      const reason = payload?.message ?? `HTTP ${response.status}`;
      throw new Error(`MSG91 rejected the message for ${maskPhone(phone)}: ${reason}`);
    }

    return { provider: 'msg91', delivered: true, providerMessageId: payload?.message };
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
export async function sendSms(phone, text) {
  return getSmsProvider().send(phone, text);
}
