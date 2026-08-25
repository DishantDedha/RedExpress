import { env } from '../config/env.js';

/**
 * Provider-agnostic email. The rest of the codebase only ever calls
 * sendEmail({ to, subject, text }); which transport actually delivers it is an env decision
 * (EMAIL_PROVIDER), same convention as smsService.js and pushService.js.
 *
 * This exists for exactly one use — CRM staff password reset (authService.js). Donors and
 * receivers sign in by OTP and never receive email from this service.
 */

const consoleProvider = {
  name: 'console',
  async send({ to, subject, text }) {
    // Deliberately prints the full address and body: this provider only runs locally.
    console.log(`\n[email:console] to ${to}\nSubject: ${subject}\n\n${text}\n`);
    return { provider: 'console', delivered: true };
  },
};

/**
 * Lazily imported so a deployment that never sets EMAIL_PROVIDER=smtp does not need
 * nodemailer installed to boot — the same reasoning as the geocoder's optional providers.
 */
async function smtpSend({ to, subject, text }) {
  const { default: nodemailer } = await import('nodemailer');

  const transport = nodemailer.createTransport({
    host: env.email.smtp.host,
    port: env.email.smtp.port,
    secure: env.email.smtp.secure,
    auth: env.email.smtp.user ? { user: env.email.smtp.user, pass: env.email.smtp.pass } : undefined,
  });

  const info = await transport.sendMail({ from: env.email.from, to, subject, text });
  return { provider: 'smtp', delivered: true, providerMessageId: info.messageId };
}

const smtpProvider = { name: 'smtp', send: smtpSend };

const providers = {
  console: consoleProvider,
  smtp: smtpProvider,
};

export function getEmailProvider() {
  const provider = providers[env.email.provider];
  if (!provider) {
    throw new Error(
      `Unknown EMAIL_PROVIDER "${env.email.provider}". Supported: ${Object.keys(providers).join(', ')}`,
    );
  }
  return provider;
}

/**
 * The one function callers use.
 * Rejects on delivery failure — the reset flow treats that as a 502 rather than pretending
 * a mail was sent, otherwise a staff member waits forever for a link that never arrives.
 */
export async function sendEmail({ to, subject, text }) {
  return getEmailProvider().send({ to, subject, text });
}
