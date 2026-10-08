/**
 * Parsing `TRUST_PROXY` into Express's `trust proxy` setting.
 *
 * Extracted from config/env.js for the same reason masterOtp.js was: it is a pure function
 * guarding something security-relevant, and it should be testable without booting the app or
 * having a database.
 *
 * ## Why the order of the checks matters
 *
 * Express accepts a boolean, a hop count, an address, or a list. The two that look alike and
 * behave nothing alike are `true` and `1`:
 *
 *   `true`  trust every proxy. `req.ip` becomes the **left-most** X-Forwarded-For entry.
 *   `1`     trust one hop. Express counts back from the socket, so `req.ip` is the address
 *           the nearest proxy appended.
 *
 * nginx is configured with `$proxy_add_x_forwarded_for`, which *appends* the real socket
 * address to whatever header arrived. A caller who sends `X-Forwarded-For: 203.0.113.9` gets
 * `203.0.113.9, <their real ip>` forwarded to Express. Under `true` the first one wins — a
 * value the caller chose.
 *
 * That turns every IP rate limiter into a formality: vary the header per request and each
 * one gets a fresh bucket. It defeats the OTP ceiling (real SMS spend), the staff password
 * ceiling (brute force), and the donor-search ceiling, which is the only thing between a
 * scraper and a directory of donors' names and phone numbers.
 *
 * So a numeric string is parsed as a count **before** the boolean words are considered.
 * Reading `'1'` as `true` is the bug this module exists to prevent; it shipped once.
 *
 * @param {string|undefined} raw  the raw TRUST_PROXY value
 * @returns {boolean|number|string} a value Express understands
 */
export function parseTrustProxy(raw) {
  if (raw === undefined || raw === null || raw.trim() === '') return false;

  const value = raw.trim().toLowerCase();

  // Exact match only: '1' is a hop count, while '1.2.3.4' must fall through to the address
  // case rather than being truncated to the number 1 by a lenient parseInt.
  const hops = Number.parseInt(value, 10);
  if (String(hops) === value) return hops;

  if (['false', 'no', 'off'].includes(value)) return false;
  if (['true', 'yes', 'on'].includes(value)) return true;

  // A named subnet ('loopback') or a comma list of addresses — Express understands both.
  return raw.trim();
}

export default parseTrustProxy;
