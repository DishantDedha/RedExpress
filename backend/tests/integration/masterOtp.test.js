import { afterAll, beforeAll, beforeEach, describe, expect, jest, test } from '@jest/globals';
import request from 'supertest';

/**
 * The demo master OTP over real HTTP, against a real database.
 *
 * ## Why this file imports its own app
 *
 * `config/env.js` validates and freezes `OTP_MASTER_CODE` at import. Setting it in
 * `setupEnv.js` would switch the bypass on for the whole integration suite, so a future test
 * asserting "this wrong code is rejected" could pass for the wrong reason. Jest gives each
 * test file its own module registry, so setting the variable here and then importing `src/`
 * dynamically confines the bypass to this file.
 *
 * ## What is worth proving
 *
 * That it works is the easy half, and the half the client will use. The half that matters is
 * everything that must keep working *while* it is enabled: a wrong code still burns an
 * attempt, the ceiling still ends the code, and staff still cannot get in this way. A bypass
 * that quietly disabled the surrounding checks would be far worse than the bypass itself.
 */

const MASTER_CODE = '419573';
const WRONG_CODE = '000111';

let app;
let prisma;
let resetFixtures;
let disconnect;
let testPhone;
let createStaff;
let testEmail;

let PHONE;
let SECOND_PHONE;

beforeAll(async () => {
  // Before any src/ module is loaded, so config/env.js reads it.
  process.env.OTP_MASTER_CODE = MASTER_CODE;

  const helpers = await import('./helpers.js');
  ({ app, resetFixtures, disconnect, testPhone, createStaff, testEmail } = helpers);
  ({ prisma } = await import('../../src/config/prisma.js'));

  // A range of their own, so this file cannot collide with otp.test.js.
  PHONE = testPhone(70);
  SECOND_PHONE = testPhone(71);

  // The bypass logs a warning on every use by design; silence it so the suite output stays
  // readable, and assert on it instead.
  jest.spyOn(console, 'warn').mockImplementation(() => {});

  await resetFixtures();
});

afterAll(async () => {
  jest.restoreAllMocks();
  delete process.env.OTP_MASTER_CODE;
  await resetFixtures();
  await disconnect();
});

beforeEach(async () => {
  console.warn.mockClear();
  await resetFixtures();
});

const requestCode = (phone) => request(app).post('/auth/otp/request').send({ phone });
const verify = (phone, code, role = 'DONOR') =>
  request(app).post('/auth/otp/verify').send({ phone, code, role });

describe('the master code verifies any number', () => {
  test('signs in a phone that has never been seen before', async () => {
    await requestCode(PHONE);

    const response = await verify(PHONE, MASTER_CODE);

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBeDefined();
    expect(response.body.user.role).toBe('DONOR');
  });

  test('works for a second, unrelated number — it is not bound to one account', async () => {
    await requestCode(SECOND_PHONE);
    expect((await verify(SECOND_PHONE, MASTER_CODE)).status).toBe(200);
  });

  test('the real generated code still works alongside it', async () => {
    // The bypass is an addition, not a replacement: nothing about normal verification changes.
    const { body } = await requestCode(PHONE);
    expect(body.devCode).toBeDefined();
    expect((await verify(PHONE, body.devCode)).status).toBe(200);
  });

  test('every use is logged, so nobody can forget it is switched on', async () => {
    await requestCode(PHONE);
    await verify(PHONE, MASTER_CODE);

    expect(console.warn).toHaveBeenCalledTimes(1);
    const [line] = console.warn.mock.calls[0];
    expect(line).toMatch(/master code used/i);
    // Masked, like every other phone number this codebase logs.
    expect(line).not.toContain(PHONE);
  });

  test('consumes the outstanding code, so it cannot be replayed', async () => {
    await requestCode(PHONE);
    await verify(PHONE, MASTER_CODE);

    const live = await prisma.otpCode.count({ where: { phone: PHONE, consumedAt: null } });
    expect(live).toBe(0);
  });
});

describe('the surrounding checks still hold while it is enabled', () => {
  test('a wrong code is still rejected and still burns an attempt', async () => {
    await requestCode(PHONE);

    const response = await verify(PHONE, WRONG_CODE);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OTP_INVALID');

    const record = await prisma.otpCode.findFirst({
      where: { phone: PHONE, consumedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    expect(record.attempts).toBe(1);
  });

  test('the attempt ceiling still burns the code', async () => {
    await requestCode(PHONE);
    for (let i = 0; i < 5; i += 1) await verify(PHONE, WRONG_CODE);

    const response = await verify(PHONE, WRONG_CODE);
    expect(response.body.error.code).toBe('OTP_ATTEMPTS_EXCEEDED');
  });

  test('the master code needs a code to have been requested first', async () => {
    // It substitutes for the comparison, not for the whole flow — so it stays inside the
    // per-phone and per-IP request limits rather than opening an unmetered second door.
    const response = await verify(SECOND_PHONE, MASTER_CODE);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('OTP_NOT_FOUND');
  });

  test('staff cannot sign in with it — the dashboard is unreachable this way', async () => {
    // The guard is structural: completePhoneLogin rejects STAFF before any code is verified.
    const staff = await createStaff({ role: 'STAFF', name: 'Master Code Staff' });
    await prisma.user.update({ where: { id: staff.user.id }, data: { phone: PHONE } });

    await requestCode(PHONE);
    const response = await verify(PHONE, MASTER_CODE);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('STAFF_MUST_USE_PASSWORD');
    expect(testEmail).toBeDefined();
  });
});
