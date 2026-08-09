import { describe, expect, test } from '@jest/globals';
import { parseMasterOtpCode } from '../src/config/masterOtp.js';

/**
 * The demo master OTP is a sign-in bypass, so these are not style checks — each one is a way
 * the bypass could reach real donors, and every rule here runs at boot in config/env.js.
 *
 * The rule that matters most is the SMS_PROVIDER one: it is what converts "we forgot to remove
 * the demo code" from a silent open door into a failed deploy.
 */

const LENGTH = 6;
const base = { length: LENGTH, smsProvider: 'console' };

describe('no master code configured', () => {
  test.each([
    ['undefined', undefined],
    ['null', null],
    ['empty string', ''],
    ['whitespace only', '   '],
  ])('%s means no bypass exists', (_label, raw) => {
    expect(parseMasterOtpCode({ ...base, raw })).toBeNull();
  });
});

describe('a valid master code', () => {
  test('is returned as-is', () => {
    expect(parseMasterOtpCode({ ...base, raw: '419573' })).toBe('419573');
  });

  test('is trimmed, because an env var pasted from a doc carries whitespace', () => {
    expect(parseMasterOtpCode({ ...base, raw: '  419573\n' })).toBe('419573');
  });

  test('may start with a zero — it is a string of digits, not a number', () => {
    expect(parseMasterOtpCode({ ...base, raw: '049573' })).toBe('049573');
  });

  test('honours a non-default OTP_LENGTH', () => {
    expect(parseMasterOtpCode({ raw: '4195', length: 4, smsProvider: 'console' })).toBe('4195');
  });
});

describe('refused alongside a real SMS gateway', () => {
  // The central guard. Once codes are actually delivered, the people receiving them are real,
  // and a bypass must not be one deploy away from being live.
  test.each(['msg91', 'twilio', 'MSG91'])('SMS_PROVIDER=%s throws at boot', (smsProvider) => {
    expect(() => parseMasterOtpCode({ ...base, raw: '419573', smsProvider })).toThrow(
      /bypass for demos only/i,
    );
  });

  test('the error names the variable to unset', () => {
    expect(() => parseMasterOtpCode({ ...base, raw: '419573', smsProvider: 'msg91' })).toThrow(
      /OTP_MASTER_CODE/,
    );
  });

  test('an unset code is fine with a real gateway — that is the normal production shape', () => {
    expect(parseMasterOtpCode({ ...base, raw: undefined, smsProvider: 'msg91' })).toBeNull();
  });
});

describe('refused when it could not be typed into the app', () => {
  // mobile/components/OtpInput.js strips non-digits and slices to OTP_LENGTH, so anything
  // below is a code the client could never actually enter.
  test.each([
    ['too short', '4195'],
    ['too long', '4195734'],
    ['letters', 'abcdef'],
    ['mixed', '41957a'],
    ['spaced', '419 573'],
    ['hyphenated', '419-73'],
    ['plus sign', '+41957'],
  ])('%s throws at boot', (_label, raw) => {
    expect(() => parseMasterOtpCode({ ...base, raw })).toThrow(/exactly 6 digits/i);
  });
});

describe('refused when guessable', () => {
  test.each([
    ['all zeroes', '000000'],
    ['all ones', '111111'],
    ['all nines', '999999'],
    ['ascending from one', '123456'],
    ['ascending from two', '234567'],
    ['ascending through zero', '567890'],
    ['descending', '654321'],
    ['descending to zero', '543210'],
  ])('%s throws at boot', (_label, raw) => {
    expect(() => parseMasterOtpCode({ ...base, raw })).toThrow(/anyone would try first/i);
  });

  test('a random-looking code is allowed', () => {
    // Guards the guard: a rule that rejected everything would be just as broken.
    for (const code of ['419573', '860214', '073916', '285047']) {
      expect(parseMasterOtpCode({ ...base, raw: code })).toBe(code);
    }
  });
});
