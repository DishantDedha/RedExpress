import bcrypt from 'bcryptjs';
import { prisma } from '../../src/config/prisma.js';
import { createApp } from '../../src/app.js';

/**
 * Shared fixtures for the integration suite.
 *
 * ## Why these tests own their data
 *
 * They run against a real, probably seeded, database. Truncating it between runs would
 * destroy the developer's seed and make `npm run db:seed` a prerequisite of `npm test`, so
 * instead every account these tests create lives in a reserved phone-number range and is
 * deleted afterwards. `resetFixtures()` runs at the start of a file as well as the end,
 * because a suite killed with Ctrl-C never reaches its cleanup and the next run must not
 * inherit the wreckage.
 *
 * ## The reserved range
 *
 * +9189999xxxxx. Real, valid Indian mobile numbers as far as libphonenumber is concerned —
 * they have to be, or registration would reject them — but far from the +91987650xxxx block
 * prisma/seed.js uses, so a delete here can never take a seeded donor with it.
 */

export const app = createApp();

const TEST_PHONE_PREFIX = '+9189999';

/** Deterministic phone for a fixture, e.g. testPhone(1) -> '+918999900001'. */
export function testPhone(n) {
  return `${TEST_PHONE_PREFIX}${String(n).padStart(5, '0')}`;
}

/** Emails for the staff fixtures, in a domain nothing else uses. */
export function testEmail(name) {
  return `${name}@integration.redexpress.test`;
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Removes every row this suite could have created.
 *
 * The delete order is not arbitrary. Most relations cascade from User, but two do not:
 * CallLog.staff and AuditLog.actor are plain references, so Postgres refuses to delete a
 * staff account that has rung anyone or marked anyone dead. Those rows go first, and
 * because a test staff member may have called a *seeded* donor, they are matched on the
 * actor as well as the target.
 */
export async function resetFixtures() {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { phone: { startsWith: TEST_PHONE_PREFIX } },
        { email: { endsWith: '@integration.redexpress.test' } },
      ],
    },
    select: { id: true },
  });

  const ids = users.map((user) => user.id);
  if (ids.length === 0) {
    // Codes are keyed by phone, not by user, so a request that never completed leaves an
    // OtpCode row behind with no account attached to it.
    await prisma.otpCode.deleteMany({ where: { phone: { startsWith: TEST_PHONE_PREFIX } } });
    return;
  }

  const involves = { OR: [{ actorId: { in: ids } }, { targetUserId: { in: ids } }] };

  await prisma.auditLog.deleteMany({ where: involves });
  await prisma.callLog.deleteMany({
    where: { OR: [{ staffId: { in: ids } }, { donorUserId: { in: ids } }] },
  });
  await prisma.bloodRequest.deleteMany({ where: { requesterId: { in: ids } } });
  await prisma.otpCode.deleteMany({ where: { phone: { startsWith: TEST_PHONE_PREFIX } } });
  // DonorProfile, RequestMatch, Notification and DeviceToken all cascade from here.
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
}

export async function disconnect() {
  await prisma.$disconnect();
}

// ---------------------------------------------------------------------------
// Account fixtures
// ---------------------------------------------------------------------------

/**
 * A staff or admin account with a known password.
 *
 * Written straight through Prisma rather than through an endpoint because there is no
 * staff-registration API — staff are created by the seed or by an administrator, which is
 * itself a deliberate part of the design.
 */
export async function createStaff({ role = 'STAFF', password = 'integration-password', name } = {}) {
  const email = testEmail(`${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const user = await prisma.user.create({
    data: {
      email,
      name: name ?? `Integration ${role}`,
      role,
      status: 'ACTIVE',
      passwordHash: await bcrypt.hash(password, 4),
    },
  });

  return { user, email, password };
}

/**
 * A donor with a complete profile at a known position.
 *
 * The coordinates are the point of this helper: the radius tests need donors at distances
 * they can compute by hand, which no amount of seeded data guarantees.
 */
export async function createDonor({
  phoneIndex,
  name = 'Integration Donor',
  bloodGroup = 'O_POS',
  latitude,
  longitude,
  isAvailable = true,
  status = 'ACTIVE',
  state = 'Odisha',
  district = 'Khordha',
  city = 'Bhubaneswar',
} = {}) {
  return prisma.user.create({
    data: {
      phone: testPhone(phoneIndex),
      name,
      role: 'DONOR',
      status,
      isPhoneVerified: true,
      donorProfile: {
        create: {
          bloodGroup,
          gender: 'MALE',
          dateOfBirth: new Date('1995-06-15'),
          isAvailable,
          state,
          district,
          city,
          pincode: '751001',
          address: '12 Test Lane, Bhubaneswar',
          latitude,
          longitude,
        },
      },
    },
    include: { donorProfile: true },
  });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Convenience wrapper: `.set(...authHeader(token))` reads better than the raw pair. */
export function authHeader(token) {
  return ['Authorization', `Bearer ${token}`];
}

/**
 * Drives the real two-step OTP login and returns the tokens.
 *
 * Deliberately goes through HTTP rather than calling authService: the point of an
 * integration test is that the route, the validation, the rate limiter and the service all
 * agree. The code comes from `devCode`, which config/env.js only includes when the SMS
 * provider is `console` and NODE_ENV is not production — see setupEnv.js.
 */
export async function loginByOtp(request, phone, role = 'DONOR') {
  const requested = await request(app).post('/auth/otp/request').send({ phone });

  if (requested.status !== 200) {
    throw new Error(`OTP request failed (${requested.status}): ${JSON.stringify(requested.body)}`);
  }
  if (!requested.body.devCode) {
    throw new Error('No devCode in the OTP response — is SMS_PROVIDER=console and NODE_ENV != production?');
  }

  const verified = await request(app)
    .post('/auth/otp/verify')
    .send({ phone, code: requested.body.devCode, role });

  if (verified.status !== 200) {
    throw new Error(`OTP verify failed (${verified.status}): ${JSON.stringify(verified.body)}`);
  }

  return verified.body;
}

/** Staff sign-in, through the endpoint the CRM actually uses. */
export async function loginStaff(request, email, password) {
  const response = await request(app).post('/auth/staff/login').send({ email, password });

  if (response.status !== 200) {
    throw new Error(`Staff login failed (${response.status}): ${JSON.stringify(response.body)}`);
  }

  return response.body;
}
