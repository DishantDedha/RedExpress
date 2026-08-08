import { afterAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { app, disconnect } from './helpers.js';

/**
 * The HTTP-level defences: headers, cross-origin policy, body ceilings, and the shape of a
 * failure.
 *
 * These are the checks most likely to be silently undone by a later refactor — deleting one
 * line of app.js removes helmet, and nothing else in the suite would notice. Asserting them
 * here means the removal breaks a test instead of a deployment.
 *
 * CORS_ORIGINS is whatever backend/.env sets, so the tests below assert the *policy* (an
 * allow-list that answers, an unknown origin that does not) rather than a particular host.
 */

const ALLOWED_ORIGIN = (process.env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')[0].trim();

afterAll(async () => {
  await disconnect();
});

describe('security headers', () => {
  test('helmet is in front of every response', async () => {
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
    // No MIME sniffing: a JSON body must never be executed as something else.
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    // The API renders no HTML, so nothing here should ever sit in a frame.
    expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    // Express advertising its own name is free reconnaissance.
    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  test('uploaded files stay loadable from another origin', async () => {
    const response = await request(app).get('/health');

    // helmet's default here is 'same-origin', which would leave every donor's profile photo
    // as a broken image in the CRM.
    expect(response.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });
});

describe('CORS', () => {
  test('answers the configured origin', async () => {
    const response = await request(app).get('/health').set('Origin', ALLOWED_ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
  });

  test('refuses an origin that is not on the list, and says why', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://evil.example.com');

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('CORS_ORIGIN_DENIED');
    // Names the fix rather than the cors package's bare "Not allowed by CORS".
    expect(response.body.error.message).toContain('CORS_ORIGINS');
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  test('a caller with no Origin is untouched — that is the mobile app', async () => {
    // React Native's fetch is not a browser and sends no Origin. CORS has no opinion about
    // it, and locking the list down must not lock the app out.
    const response = await request(app).get('/health');

    expect(response.status).toBe(200);
  });

  test('the preflight is answered for the configured origin', async () => {
    const response = await request(app)
      .options('/donors/search')
      .set('Origin', ALLOWED_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization');

    expect(response.status).toBeLessThan(300);
    expect(response.headers['access-control-allow-headers']).toMatch(/authorization/i);
  });
});

describe('request bodies', () => {
  test('a body over the ceiling is refused before anything parses it', async () => {
    const response = await request(app)
      .post('/auth/otp/request')
      .set('Content-Type', 'application/json')
      // Well over JSON_BODY_LIMIT (100kb).
      .send(JSON.stringify({ phone: 'x'.repeat(500_000) }));

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });

  test('malformed JSON is a 400 with the usual envelope, not a stack trace', async () => {
    const response = await request(app)
      .post('/auth/otp/request')
      .set('Content-Type', 'application/json')
      .send('{"phone": ');

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('INVALID_JSON');
    expect(response.text).not.toMatch(/at .*\.js:\d+/);
  });
});

describe('error envelope', () => {
  test('an unknown route answers in the same shape as everything else', async () => {
    const response = await request(app).get('/no/such/thing');

    expect(response.status).toBe(404);
    expect(response.body.error).toMatchObject({ code: 'NOT_FOUND', message: expect.any(String) });
  });

  test('a validation failure names the fields the form should highlight', async () => {
    const response = await request(app).post('/auth/otp/request').send({ phone: 'not-a-number' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBeDefined();
    expect(response.body.error.fields).toBeDefined();
  });
});

describe('health checks', () => {
  test('liveness answers from memory and leaks nothing', async () => {
    const response = await request(app).get('/health');

    expect(response.body).toMatchObject({ status: 'ok', service: 'red-express-backend' });
    // A probe is unauthenticated, so it must not report anything a stranger could use:
    // no version, no database host, no counts.
    expect(JSON.stringify(response.body)).not.toMatch(/postgres|password|secret/i);
  });

  test('readiness actually reaches the database', async () => {
    const response = await request(app).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body.database.status).toBe('up');
    expect(response.body.database.latencyMs).toEqual(expect.any(Number));
  });
});
