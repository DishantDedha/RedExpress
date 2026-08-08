import 'dotenv/config';

/**
 * Runs before any src/ module is imported, so config/env.js reads these values rather than
 * whatever the developer's backend/.env happens to say.
 *
 * Everything here is about making the suite deterministic and offline. Nothing here weakens
 * a check the tests are meant to exercise: the OTP expiry, the attempt ceiling, the
 * per-phone request limit and the token-version comparison all run exactly as they do in
 * production.
 */

// Not 'production' — that would suppress `devCode` in the OTP response and the tests would
// have no way to learn the code. Not 'development' either: some modules cache a Prisma
// client on globalThis in development, which leaks between Jest module registries.
process.env.NODE_ENV = 'test';

// No SMS is sent and no push leaves the machine. The console SMS provider is also what makes
// the generated code readable in the response (config/env.js: exposeOtpInResponse).
process.env.SMS_PROVIDER = 'console';
process.env.PUSH_PROVIDER = 'console';

// No outbound geocoding: tests supply coordinates directly.
process.env.GEOCODER_PROVIDER = 'none';
process.env.STORAGE_DRIVER = 'local';

/**
 * The IP-level limiters are off by default here, and that is a deliberate, narrow choice.
 *
 * They would otherwise fire partway through an unrelated test — twenty sign-ins from one
 * address is exactly what this suite does — and the failure would look like an auth bug.
 * The limits are not left untested: tests/integration/rateLimit.test.js turns them back on
 * and drives them directly, and the per-phone OTP limit in services/otpService.js is
 * database-backed, stays on throughout, and has its own test in otp.test.js.
 */
process.env.RATE_LIMIT_ENABLED = 'false';

// bcrypt is deliberately slow, and this suite hashes an OTP on every code request. Four
// rounds keeps the suite quick; the algorithm and the comparison are unchanged, and
// bcrypt.compare reads the cost factor from the stored hash, so seeded users hashed at 10
// still verify.
process.env.BCRYPT_ROUNDS = '4';
