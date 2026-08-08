import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import { env } from '../config/env.js';
import { tryNormalizePhone } from '../utils/phone.js';

/**
 * IP-level rate limiting.
 *
 * This sits *under* the per-phone OTP limit already enforced in services/otpService.js, and
 * the two answer different questions. The phone limit stops one number being texted forty
 * times; it does nothing about a host that walks a list of forty numbers, requesting one
 * code each. That is what these do.
 *
 * ## Storage
 *
 * The default store is in-process memory, which means each instance counts separately. For
 * a single Node process — the shape docs/deploy.md describes — that is exactly right. If
 * this is ever run behind more than one instance the limits multiply by the instance count,
 * and the store must move to Redis (`rate-limit-redis`); the note is in deploy.md so the
 * decision is made deliberately rather than discovered during an incident.
 *
 * ## Behind a proxy
 *
 * Every limiter keys on `req.ip`, which is only meaningful if `trust proxy` matches the
 * real deployment. See env.trustProxy — set TRUST_PROXY, or all traffic shares one bucket.
 */

/** Emits the same `{ error: { code, message } }` envelope as everything else. */
function limitHandler(code, message) {
  return (req, res) => {
    res.status(429).json({ error: { code, message } });
  };
}

/**
 * The phone number, when the caller supplied one, otherwise the IP.
 *
 * Keying the OTP endpoints on the number as well means a single phone cannot be worked on
 * from a rotating pool of addresses — which is the shape a real OTP-flood attack takes, and
 * the one thing an IP-only limit misses.
 *
 * The number is normalised to E.164 first, because these limiters run *before* validate()
 * and therefore see whatever the client typed. Without normalisation "9876543210" and
 * "+91 98765 43210" are two buckets for one phone, and alternating between them doubles the
 * ceiling for free.
 *
 * `ipKeyGenerator(req.ip)` rather than raw `req.ip`: it buckets an IPv6 caller by their /64
 * prefix. Without it, anyone on an ordinary IPv6 allocation gets a fresh bucket by changing
 * one hex digit of their own address. Note the argument is the address string — in
 * express-rate-limit v8 this helper takes `(ip, ipv6Subnet)`, not the `(req, res)` pair
 * v7 took, and passing the request instead throws inside the header writer.
 */
function phoneOrIpKey(req) {
  const phone = typeof req.body?.phone === 'string' ? tryNormalizePhone(req.body.phone) : null;
  // Unparseable numbers fall back to the IP rather than getting their own bucket — otherwise
  // an attacker earns a fresh allowance per malformed string they invent.
  return phone ? `phone:${phone}` : ipKeyGenerator(req.ip);
}

const SHARED = {
  standardHeaders: 'draft-8',
  // The X-RateLimit-* headers were never standardised and only duplicate RateLimit-*.
  legacyHeaders: false,
  // Off means the limiters become pass-throughs — used by the integration tests, which
  // deliberately hammer the OTP endpoints. Never set RATE_LIMIT_ENABLED=false in production.
  skip: () => !env.rateLimit.enabled,
};

/**
 * The floor under everything. Deliberately loose: it is a runaway-client and crude-flood
 * guard, not the security control. The specific limiters below are the security control.
 */
export const globalLimiter = rateLimit({
  ...SHARED,
  windowMs: env.rateLimit.global.windowMs,
  limit: env.rateLimit.global.limit,
  handler: limitHandler('RATE_LIMITED', 'Too many requests. Please wait a moment and try again.'),
});

/**
 * Requesting a one-time password. Each of these spends real money on an SMS and puts a text
 * on someone's phone, so the ceiling is low and the window long.
 */
export const otpRequestLimiter = rateLimit({
  ...SHARED,
  windowMs: env.rateLimit.otp.windowMs,
  limit: env.rateLimit.otp.limit,
  keyGenerator: phoneOrIpKey,
  handler: limitHandler(
    'OTP_RATE_LIMITED',
    'Too many code requests from this device. Please wait a while and try again.',
  ),
});

/**
 * Verifying a code and signing staff in — the two endpoints where guessing repeatedly is
 * the attack. A six-digit code has a million values; OTP_MAX_ATTEMPTS (5) burns a single
 * code after five wrong guesses, and this stops the same host cycling fresh codes to keep
 * guessing.
 */
export const authAttemptLimiter = rateLimit({
  ...SHARED,
  windowMs: env.rateLimit.auth.windowMs,
  limit: env.rateLimit.auth.limit,
  keyGenerator: phoneOrIpKey,
  // A correct password or code should not count against the ceiling — otherwise a busy
  // shared office network locks out the staff who are signing in successfully.
  skipSuccessfulRequests: true,
  handler: limitHandler(
    'AUTH_RATE_LIMITED',
    'Too many sign-in attempts. Please wait 15 minutes and try again.',
  ),
});

/**
 * Donor search. Every page of results is a page of real people's names and phone numbers,
 * so this is the anti-scraping limit: generous enough that a person refining filters never
 * notices, tight enough that walking the directory takes days.
 */
export const searchLimiter = rateLimit({
  ...SHARED,
  windowMs: env.rateLimit.search.windowMs,
  limit: env.rateLimit.search.limit,
  handler: limitHandler(
    'SEARCH_RATE_LIMITED',
    'Too many searches. Please wait a moment and try again.',
  ),
});
