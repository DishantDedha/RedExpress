/**
 * The only thing in the app that writes to the console.
 *
 * ## Why a wrapper and not `console.warn`
 *
 * On a release build, `console.*` is not the no-op people assume. React Native keeps the
 * calls; anything logged is readable over `adb logcat` from any machine the phone is plugged
 * into, and iOS surfaces it in the device console. Red Express handles phone numbers, home
 * addresses, coordinates, JWTs and one-time passwords. A single `console.log(response)` on a
 * login path is enough to leave a donor's access token in a system log that survives the
 * process — which is exactly the leak that storing tokens in expo-secure-store was meant to
 * prevent.
 *
 * So there are two rules, and this module enforces both:
 *
 *   1. **Nothing is logged outside development.** Every function here returns immediately
 *      when `__DEV__` is false. There is no log level that escapes this.
 *   2. **Even in development, secrets are redacted.** Developers screen-share, paste logs
 *      into issues, and record demos. `redact` walks whatever it is given and replaces the
 *      values of sensitive keys, masks anything that looks like a phone number, and truncates
 *      JWTs to their first few characters.
 *
 * Nothing here is a substitute for not logging sensitive data in the first place — it is the
 * net under that. Prefer `logger.warn('[push] registration failed', error.message)` to
 * throwing a whole response object at it.
 */

/**
 * Keys whose values are never printed, matched case-insensitively as substrings — so
 * `accessToken`, `refreshToken`, `expoPushToken`, `passwordHash` and `otpCode` are all
 * caught by four entries.
 */
const SECRET_KEYS = ['token', 'password', 'secret', 'authorization', 'code', 'otp', 'hash'];

/** Keys whose values are masked rather than removed, because the shape is useful. */
const PII_KEYS = ['phone', 'contactphone', 'address', 'email', 'latitude', 'longitude'];

const REDACTED = '[redacted]';

function isSecretKey(key) {
  const lower = String(key).toLowerCase();
  return SECRET_KEYS.some((needle) => lower.includes(needle));
}

function isPiiKey(key) {
  const lower = String(key).toLowerCase();
  return PII_KEYS.some((needle) => lower === needle || lower.endsWith(needle));
}

/** Keeps the last four digits — enough to recognise a number, useless as a contact list. */
function maskPhone(value) {
  const text = String(value);
  if (text.length <= 4) return text;
  return `${'*'.repeat(text.length - 4)}${text.slice(-4)}`;
}

/** A JWT is three dot-separated base64url segments; the payload is readable by anyone. */
function looksLikeJwt(value) {
  return typeof value === 'string' && /^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(value);
}

/**
 * Returns a copy of `value` safe to print.
 *
 * Recursive, with a depth limit: an Axios-style error or a navigation state can be deep
 * enough and cyclic enough to hang a naive walk, and a logger that freezes the app in
 * development is worse than no logger.
 */
export function redact(value, depth = 0) {
  if (depth > 4) return '[…]';

  if (value === null || value === undefined) return value;

  if (looksLikeJwt(value)) return `${String(value).slice(0, 8)}…[jwt]`;

  if (typeof value !== 'object') return value;

  if (value instanceof Error) {
    // The message and name, never the stack — a React Native stack carries absolute file
    // paths from the build machine.
    return `${value.name}: ${redact(value.message, depth + 1)}`;
  }

  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1));

  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (isSecretKey(key)) out[key] = REDACTED;
    else if (isPiiKey(key)) out[key] = typeof item === 'string' ? maskPhone(item) : REDACTED;
    else out[key] = redact(item, depth + 1);
  }
  return out;
}

function write(method, args) {
  // Rule 1. Not a level check — a hard stop, so no future "log this in production just
  // this once" can slip past it.
  if (!__DEV__) return;
  // eslint-disable-next-line no-console -- this is the one place console is allowed.
  console[method](...args.map((arg) => redact(arg)));
}

export const logger = {
  debug: (...args) => write('log', args),
  warn: (...args) => write('warn', args),
  error: (...args) => write('error', args),
};

export default logger;
