import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { prisma } from '../../src/config/prisma.js';
import { app, disconnect, resetFixtures, testPhone } from './helpers.js';

/**
 * The phone-OTP login, end to end over HTTP.
 *
 * What is actually being checked here — none of which a unit test can see, because every
 * one of these rules lives in the interaction between the route, the OtpCode table and the
 * clock:
 *
 *   - the plaintext code is never stored, only its bcrypt hash;
 *   - a wrong code burns an attempt, and the fifth wrong guess burns the code;
 *   - an expired code is refused even though it was never used;
 *   - requesting a new code retires the old one, so only the newest text works;
 *   - the per-phone request ceiling holds across separate HTTP calls;
 *   - a first successful verification creates the account.
 */

const PHONE = testPhone(10);
const OTHER_PHONE = testPhone(11);

beforeAll(async () => {
  await resetFixtures();
});

afterAll(async () => {
  await resetFixtures();
  await disconnect();
});

beforeEach(async () => {
  // Each test starts with no live codes and no account for these numbers, so the
  // per-phone rate limit and the "newest code wins" rule are measured from zero.
  await resetFixtures();
});

async function requestCode(phone = PHONE) {
  return request(app).post('/auth/otp/request').send({ phone });
}

describe('POST /auth/otp/request', () => {
  test('sends a code and never returns or stores the plaintext', async () => {
    const response = await requestCode();

    expect(response.status).toBe(200);
    expect(response.body.phone).toBe(PHONE);
    // The masked form is what the app reads aloud; the full number is echoed for the client
    // to display, but the confirmation copy must not spell out twelve digits.
    expect(response.body.maskedPhone).toMatch(/^\*+\d{4}$/);
    expect(response.body.message).toContain(response.body.maskedPhone);

    const stored = await prisma.otpCode.findFirst({ where: { phone: PHONE } });

    expect(stored).not.toBeNull();
    expect(stored.codeHash).toMatch(/^\$2[aby]\$/); // a bcrypt hash, not the digits
    expect(stored.codeHash).not.toContain(response.body.devCode);
    expect(stored.consumedAt).toBeNull();
    expect(stored.attempts).toBe(0);
    expect(stored.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  test('normalises the number, so one phone is one account and one rate-limit bucket', async () => {
    // The same subscriber, written three ways a person might actually type it.
    const national = PHONE.replace('+91', '');
    const spaced = `+91 ${national.slice(0, 5)} ${national.slice(5)}`;

    for (const spelling of [national, spaced, PHONE]) {
      const response = await request(app).post('/auth/otp/request').send({ phone: spelling });
      expect(response.status).toBe(200);
      expect(response.body.phone).toBe(PHONE);
    }

    // Three requests, one number: the fourth is over OTP_REQUESTS_PER_WINDOW.
    const fourth = await requestCode();
    expect(fourth.status).toBe(429);
    expect(fourth.body.error.code).toBe('OTP_RATE_LIMITED');
  });

  test('rejects a landline, because a code has to arrive by text', async () => {
    const response = await request(app).post('/auth/otp/request').send({ phone: '+912261234567' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_PHONE');
    expect(response.body.error.fields.phone).toBeDefined();
  });

  test('holds the per-phone ceiling and does not spill onto other numbers', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect((await requestCode()).status).toBe(200);
    }

    const blocked = await requestCode();
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('OTP_RATE_LIMITED');

    // A different number is unaffected — the limit is per phone, not global.
    expect((await requestCode(OTHER_PHONE)).status).toBe(200);
  });

  test('retires the previous code, so only the newest text works', async () => {
    const first = await requestCode();
    const second = await requestCode();

    expect(first.body.devCode).not.toBe(second.body.devCode);

    const stale = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: first.body.devCode, role: 'DONOR' });

    expect(stale.status).toBe(400);
    expect(stale.body.error.code).toBe('OTP_INVALID');

    const fresh = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: second.body.devCode, role: 'DONOR' });

    expect(fresh.status).toBe(200);
  });
});

describe('POST /auth/otp/verify', () => {
  test('creates the account and issues both tokens on first use', async () => {
    const { body: requested } = await requestCode();

    const response = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: requested.devCode, role: 'DONOR' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.user).toMatchObject({
      phone: PHONE,
      role: 'DONOR',
      status: 'ACTIVE',
      isPhoneVerified: true,
    });
    expect(response.body.isNewUser).toBe(true);
    // The account exists but the form has not been filled in — the app uses this to route
    // to registration rather than to a half-empty home screen.
    expect(response.body.profileComplete).toBe(false);

    // Nothing anywhere in the response leaks the credential material.
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const consumed = await prisma.otpCode.findFirst({ where: { phone: PHONE } });
    expect(consumed.consumedAt).not.toBeNull();
  });

  test('the access token works immediately against a protected route', async () => {
    const { body: requested } = await requestCode();
    const { body: verified } = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: requested.devCode, role: 'DONOR' });

    const me = await request(app).get('/me').set('Authorization', `Bearer ${verified.accessToken}`);

    expect(me.status).toBe(200);
    expect(me.body.user.phone).toBe(PHONE);
  });

  test('a wrong code burns one attempt and says how many are left', async () => {
    await requestCode();

    const response = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: '000000', role: 'DONOR' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OTP_INVALID');
    expect(response.body.error.message).toMatch(/4 attempts remaining/);

    const stored = await prisma.otpCode.findFirst({ where: { phone: PHONE } });
    expect(stored.attempts).toBe(1);
    // Still usable — one wrong guess is a typo, not an attack.
    expect(stored.consumedAt).toBeNull();
  });

  test('burns the code after OTP_MAX_ATTEMPTS wrong guesses, even if the real code follows', async () => {
    const { body: requested } = await requestCode();

    for (let i = 0; i < 5; i += 1) {
      const wrong = await request(app)
        .post('/auth/otp/verify')
        .send({ phone: PHONE, code: '000000', role: 'DONOR' });
      expect(wrong.status).toBe(400);
    }

    // The genuine code is now worthless: this is what stops a six-digit space being walked.
    const correct = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: requested.devCode, role: 'DONOR' });

    expect(correct.status).toBe(400);
    expect(correct.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');

    expect((await prisma.otpCode.findFirst({ where: { phone: PHONE } })).consumedAt).not.toBeNull();
    expect(await prisma.user.findUnique({ where: { phone: PHONE } })).toBeNull();
  });

  test('refuses an expired code', async () => {
    const { body: requested } = await requestCode();

    // Reaching into the row rather than waiting five minutes. The expiry comparison in
    // otpService is what is under test, not the passage of time.
    await prisma.otpCode.updateMany({
      where: { phone: PHONE, consumedAt: null },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const response = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: requested.devCode, role: 'DONOR' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OTP_EXPIRED');
  });

  test('a code cannot be replayed once it has been used', async () => {
    const { body: requested } = await requestCode();

    const first = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: requested.devCode, role: 'DONOR' });
    expect(first.status).toBe(200);

    const replay = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: requested.devCode, role: 'DONOR' });

    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe('OTP_NOT_FOUND');
  });

  test('a returning user keeps the role they already have', async () => {
    const { body: first } = await requestCode();
    await request(app).post('/auth/otp/verify').send({ phone: PHONE, code: first.devCode, role: 'DONOR' });

    // Signing in again through the "Find Blood" entry point must not demote a donor.
    const { body: second } = await requestCode();
    const response = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: second.devCode, role: 'RECEIVER' });

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe('DONOR');
    expect(response.body.isNewUser).toBe(false);
  });

  test('a staff account cannot be taken over through the OTP flow', async () => {
    // Give the number to a staff member, then try to sign in to it as an app user.
    const { body: requested } = await requestCode();
    await prisma.user.create({
      data: { phone: PHONE, name: 'Staff With A Phone', role: 'STAFF', status: 'ACTIVE' },
    });

    const response = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: requested.devCode, role: 'DONOR' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('STAFF_MUST_USE_PASSWORD');
  });
});

describe('POST /auth/refresh', () => {
  test('trades a refresh token for a new access token', async () => {
    const { body: requested } = await requestCode();
    const { body: session } = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: requested.devCode, role: 'DONOR' });

    const response = await request(app).post('/auth/refresh').send({ refreshToken: session.refreshToken });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toEqual(expect.any(String));

    const me = await request(app).get('/me').set('Authorization', `Bearer ${response.body.accessToken}`);
    expect(me.status).toBe(200);
  });

  test('an access token is not a refresh token', async () => {
    const { body: requested } = await requestCode();
    const { body: session } = await request(app)
      .post('/auth/otp/verify')
      .send({ phone: PHONE, code: requested.devCode, role: 'DONOR' });

    // Signed with JWT_ACCESS_SECRET; the refresh path verifies against JWT_REFRESH_SECRET.
    // Using one secret for both would make a leaked access token good for thirty days.
    const response = await request(app).post('/auth/refresh').send({ refreshToken: session.accessToken });

    expect(response.status).toBe(401);
  });
});
