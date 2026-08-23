import { describe, expect, test } from '@jest/globals';
import { buildVerifyRequest, readVerifyResponse, toE164 } from '../src/services/msg91Widget.js';

/**
 * Verifying an MSG91 OTP-widget token.
 *
 * This module is the entire security boundary of the widget sign-in path. The code is checked
 * by MSG91, not here, so the only thing standing between an access token and a session is
 * whether these functions read MSG91's answer correctly. Two failures matter most:
 *
 *   - treating a rejected token as accepted, which hands out a session to anyone;
 *   - reading the wrong field as the phone number, which hands out *someone else's* session.
 *
 * MSG91 answers HTTP 200 to a forged token as readily as to a real one, so the status code is
 * not the verdict — `type` is.
 */

const AUTH_KEY = 'test-auth-key';

describe('building the request', () => {
  const built = () => buildVerifyRequest({ accessToken: 'jwt.abc.123', authKey: AUTH_KEY });

  test('posts to the widget verify endpoint', () => {
    expect(built().url).toBe('https://control.msg91.com/api/v5/widget/verifyAccessToken');
    expect(built().init.method).toBe('POST');
  });

  test('sends the token under MSG91’s hyphenated key', () => {
    // `access-token`, not `accessToken`. Getting this wrong returns a rejection that reads
    // exactly like a forged token.
    const body = JSON.parse(built().init.body);
    expect(body['access-token']).toBe('jwt.abc.123');
    expect(body.authkey).toBe(AUTH_KEY);
  });

  test('refuses to build without an auth key rather than sending an anonymous request', () => {
    expect(() => buildVerifyRequest({ accessToken: 'jwt.abc.123', authKey: '' })).toThrow(
      /MSG91_AUTH_KEY/,
    );
  });

  test.each([
    ['empty', ''],
    ['undefined', undefined],
    ['not a string', 12345],
  ])('refuses a %s token', (_label, accessToken) => {
    expect(() => buildVerifyRequest({ accessToken, authKey: AUTH_KEY })).toThrow(/access token/i);
  });
});

describe('reading the verdict', () => {
  test('type=success with a number is an acceptance', () => {
    expect(
      readVerifyResponse({ ok: true, status: 200, payload: { type: 'success', message: '919876543210' } }),
    ).toEqual({ ok: true, identifier: '919876543210' });
  });

  test('type=error at HTTP 200 is a REJECTION', () => {
    // The single most important assertion here. MSG91 returns 200 for a forged token; reading
    // only the status would sign that person in.
    expect(
      readVerifyResponse({ ok: true, status: 200, payload: { type: 'error', message: 'Invalid token' } }),
    ).toEqual({ ok: false, reason: 'Invalid token' });
  });

  test.each([
    ['no type at all', {}],
    ['an unexpected type', { type: 'pending' }],
    ['a null payload', null],
  ])('%s is a rejection, not an acceptance', (_label, payload) => {
    expect(readVerifyResponse({ ok: true, status: 200, payload })).toMatchObject({ ok: false });
  });

  test('success with no phone number is a rejection', () => {
    // Accepting this would mean calling normalizePhone('') and failing further downstream,
    // where the cause is much harder to see.
    expect(
      readVerifyResponse({ ok: true, status: 200, payload: { type: 'success', message: '' } }),
    ).toMatchObject({ ok: false, reason: expect.stringMatching(/no phone number/i) });
  });

  test('an HTTP failure reports MSG91’s message when there is one', () => {
    expect(
      readVerifyResponse({ ok: false, status: 401, payload: { message: 'Authentication failure' } }),
    ).toEqual({ ok: false, reason: 'Authentication failure' });
  });

  test('an HTTP failure with no body still reports the status', () => {
    expect(readVerifyResponse({ ok: false, status: 502, payload: {} })).toEqual({
      ok: false,
      reason: 'HTTP 502',
    });
  });
});

describe('normalising the number MSG91 returns', () => {
  test('adds the missing plus', () => {
    // MSG91 returns 919876543210. Passed on unchanged, libphonenumber reads it as a national
    // number against DEFAULT_PHONE_REGION and produces the wrong country or nothing.
    expect(toE164('919876543210')).toBe('+919876543210');
  });

  test('leaves an already-E.164 number alone', () => {
    expect(toE164('+919876543210')).toBe('+919876543210');
  });

  test('trims whitespace', () => {
    expect(toE164('  919876543210 ')).toBe('+919876543210');
  });

  test('passes anything unrecognisable through for normalizePhone to reject', () => {
    // Better a clear rejection from the phone parser than a plausible-looking number
    // invented here.
    expect(toE164('not-a-number')).toBe('not-a-number');
  });
});
