import { describe, expect, test } from '@jest/globals';
import { buildMsg91Request, readMsg91Response } from '../src/services/msg91Request.js';

/**
 * The MSG91 request shape.
 *
 * Worth testing without a network because every failure mode here is silent: MSG91 answers
 * 200 to a message it has thrown away, so a wrong parameter does not raise anything — the
 * user simply waits for a text that never comes, and the server reports success.
 *
 * The single most important assertion in this file is that our own `otp` is sent. If it were
 * omitted, MSG91 would generate a code of its own, deliver that, and the user would type a
 * number that could not possibly match the bcrypt hash in `OtpCode`. Sign-in would fail for
 * everyone, with no error anywhere to explain it.
 */

const config = {
  authKey: 'test-auth-key',
  senderId: 'REDEXP',
  templateId: '',
  route: '4',
};

const base = { phone: '+919876543210', text: '123456 is your code.', otp: '123456', expiryMinutes: 5 };

const params = (url) => Object.fromEntries(new URL(url).searchParams);

describe('OTP channel — used when MSG91_TEMPLATE_ID is set', () => {
  const withTemplate = { ...config, templateId: 'tmpl_abc123' };
  const built = () => buildMsg91Request({ ...base, config: withTemplate });

  test('targets the v5 OTP endpoint', () => {
    expect(built().api).toBe('otp');
    expect(built().url).toContain('control.msg91.com/api/v5/otp');
  });

  test('sends OUR code, not one of MSG91’s making', () => {
    // The assertion this whole file exists for.
    expect(params(built().url).otp).toBe('123456');
  });

  test('passes the template id', () => {
    expect(params(built().url).template_id).toBe('tmpl_abc123');
  });

  test('strips the leading + but keeps the country code', () => {
    expect(params(built().url).mobile).toBe('919876543210');
  });

  test('mirrors our expiry so the two systems do not disagree', () => {
    expect(params(built().url).otp_expiry).toBe('5');
  });

  test('authenticates with the authkey header, never a query parameter', () => {
    // A key in the URL ends up in access logs and proxy logs on the way.
    expect(built().init.headers.authkey).toBe('test-auth-key');
    expect(params(built().url).authkey).toBeUndefined();
  });

  test('does not need a sender id — the OTP channel has its own', () => {
    expect(() =>
      buildMsg91Request({ ...base, config: { ...withTemplate, senderId: '' } }),
    ).not.toThrow();
  });
});

describe('flat SMS channel — the DLT path, used when no template id is set', () => {
  const built = () => buildMsg91Request({ ...base, config });

  test('targets the v2 sendsms endpoint', () => {
    expect(built().api).toBe('sms');
    expect(built().url).toContain('api.msg91.com/api/v2/sendsms');
  });

  test('carries the rendered message and the sender id', () => {
    const body = JSON.parse(built().init.body);
    expect(body.sender).toBe('REDEXP');
    expect(body.sms[0].message).toBe('123456 is your code.');
    expect(body.sms[0].to).toEqual(['919876543210']);
  });

  test('refuses to build without a sender id, naming the reason', () => {
    expect(() => buildMsg91Request({ ...base, config: { ...config, senderId: '' } })).toThrow(
      /MSG91_SENDER_ID/,
    );
  });
});

describe('misconfiguration fails loudly', () => {
  test('a missing auth key throws rather than sending an unauthenticated request', () => {
    expect(() => buildMsg91Request({ ...base, config: { ...config, authKey: '' } })).toThrow(
      /MSG91_AUTH_KEY/,
    );
  });
});

describe('reading the response', () => {
  // MSG91 returns 200 for a rejected message as readily as for a delivered one, so the
  // status code alone would report success for something nobody received.
  test('a 200 with type=error is a failure', () => {
    expect(
      readMsg91Response({ status: 200, ok: true, payload: { type: 'error', message: 'Invalid template' } }),
    ).toEqual({ ok: false, reason: 'Invalid template' });
  });

  test('a 200 with type=success is a delivery', () => {
    expect(
      readMsg91Response({ status: 200, ok: true, payload: { type: 'success', message: 'req-id-1' } }),
    ).toEqual({ ok: true, id: 'req-id-1' });
  });

  test('an HTTP failure reports the provider message when there is one', () => {
    expect(
      readMsg91Response({ status: 401, ok: false, payload: { message: 'Authentication failure' } }),
    ).toEqual({ ok: false, reason: 'Authentication failure' });
  });

  test('an HTTP failure with no body still reports the status', () => {
    expect(readMsg91Response({ status: 502, ok: false, payload: {} })).toEqual({
      ok: false,
      reason: 'HTTP 502',
    });
  });
});
