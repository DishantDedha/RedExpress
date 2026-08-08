import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';

/**
 * The IP-level rate limiters, driven until they actually fire.
 *
 * setupEnv.js turns them off for the rest of the suite — twenty sign-ins from one address is
 * exactly what an integration run looks like, and a limiter tripping in the middle of the
 * lifecycle test would read as an auth bug. So this file turns them back on, with ceilings
 * low enough to reach in a few requests, **before** importing anything under src/.
 *
 * That ordering is the whole trick. config/env.js snapshots process.env once at import, and
 * each limiter is constructed at module load from that snapshot, so the assignments below
 * have to happen before the first `import` of src/ — which is why this file uses a dynamic
 * import instead of the static ones every other file here uses. Jest gives each test file a
 * fresh module registry, so nothing this does leaks into the others.
 */

process.env.RATE_LIMIT_ENABLED = 'true';
process.env.RATE_LIMIT_MAX = '1000'; // the global floor stays out of the way
process.env.RATE_LIMIT_WINDOW_MS = '60000';
process.env.OTP_IP_RATE_LIMIT_MAX = '2';
process.env.OTP_IP_RATE_LIMIT_WINDOW_MS = '60000';
process.env.AUTH_RATE_LIMIT_MAX = '3';
process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
process.env.SEARCH_RATE_LIMIT_MAX = '2';
process.env.SEARCH_RATE_LIMIT_WINDOW_MS = '60000';

const { app, createStaff, disconnect, loginByOtp, loginStaff, resetFixtures, testPhone } =
  await import('./helpers.js');

const PHONE = testPhone(40);
const OTHER_PHONE = testPhone(41);

let staff;
let donorToken;

beforeAll(async () => {
  await resetFixtures();
  staff = await createStaff({ role: 'STAFF' });
  // Signing in spends part of the OTP allowance for this number, which is why the tests
  // below each use their own.
  donorToken = (await loginByOtp(request, testPhone(49), 'DONOR')).accessToken;
});

afterAll(async () => {
  await resetFixtures();
  await disconnect();
});

describe('OTP request limiter', () => {
  test('stops a flood of code requests at the ceiling', async () => {
    expect((await request(app).post('/auth/otp/request').send({ phone: PHONE })).status).toBe(200);
    expect((await request(app).post('/auth/otp/request').send({ phone: PHONE })).status).toBe(200);

    const blocked = await request(app).post('/auth/otp/request').send({ phone: PHONE });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('OTP_RATE_LIMITED');
    // The same envelope as every other failure, so the app's error handling needs no
    // special case for a 429.
    expect(blocked.body.error.message).toEqual(expect.any(String));
  });

  test('buckets by the normalised number, so respelling it is not a way around', async () => {
    const national = OTHER_PHONE.replace('+91', '');

    expect((await request(app).post('/auth/otp/request').send({ phone: OTHER_PHONE })).status).toBe(200);
    // Same subscriber, different spelling. The limiter normalises to E.164 before keying,
    // so this lands in the bucket the first request opened rather than a fresh one.
    expect((await request(app).post('/auth/otp/request').send({ phone: national })).status).toBe(200);

    const third = await request(app)
      .post('/auth/otp/request')
      .send({ phone: `+91 ${national.slice(0, 5)} ${national.slice(5)}` });

    expect(third.status).toBe(429);
  });
});

describe('sign-in attempt limiter', () => {
  test('stops password guessing but does not punish success', async () => {
    // Three wrong passwords: allowed, and each one counted.
    for (let i = 0; i < 3; i += 1) {
      const wrong = await request(app)
        .post('/auth/staff/login')
        .send({ email: staff.email, password: 'not-the-password' });
      expect(wrong.status).toBe(401);
    }

    const blocked = await request(app)
      .post('/auth/staff/login')
      .send({ email: staff.email, password: 'not-the-password' });

    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('AUTH_RATE_LIMITED');
  });
});

describe('search limiter', () => {
  test('caps how fast the donor directory can be paged through', async () => {
    const search = () =>
      request(app)
        .get('/donors/search')
        .query({ state: 'Odisha' })
        .set('Authorization', `Bearer ${donorToken}`);

    expect((await search()).status).toBe(200);
    expect((await search()).status).toBe(200);

    const blocked = await search();

    // Holding a valid session is not a licence to scrape: signing in costs one SMS, so the
    // ceiling has to sit behind the auth check rather than in front of it.
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('SEARCH_RATE_LIMITED');
  });
});

describe('what the limiters leave alone', () => {
  test('health probes are never rate limited', async () => {
    // Mounted ahead of the global limiter. A platform polls this from one address on a
    // fixed interval; counting it would eventually mark a healthy service unhealthy.
    for (let i = 0; i < 12; i += 1) {
      expect((await request(app).get('/health')).status).toBe(200);
    }
  });

  test('limited endpoints advertise the standard RateLimit headers', async () => {
    const response = await request(app).get('/health/ready');
    expect(response.headers['ratelimit-policy']).toBeUndefined();

    const limited = await request(app)
      .get('/donors/search')
      .query({ state: 'Odisha' })
      .set('Authorization', `Bearer ${donorToken}`);

    // draft-8 headers, so a client can back off deliberately instead of retrying blind.
    expect(limited.headers['ratelimit-policy']).toBeDefined();
    // The obsolete X-RateLimit-* mirrors are off; they only duplicated these.
    expect(limited.headers['x-ratelimit-limit']).toBeUndefined();
  });
});
