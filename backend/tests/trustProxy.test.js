import { describe, expect, test } from '@jest/globals';
import { parseTrustProxy } from '../src/config/trustProxy.js';

/**
 * These are not style checks.
 *
 * `TRUST_PROXY=1` once parsed to boolean `true`, because '1' sat in the same list as 'true'
 * and was matched before the number was ever parsed. Express reads `true` as "trust every
 * proxy" and takes the left-most X-Forwarded-For entry — which the caller supplies. Every IP
 * rate limiter became opt-in: send a different forged header per request and each one gets a
 * fresh bucket.
 *
 * It was found by forging the header against the live API and watching the remaining quota
 * reset to its maximum on every request. The first test below is that bug.
 */

describe('parseTrustProxy', () => {
  test("'1' is one hop, NOT boolean true", () => {
    const result = parseTrustProxy('1');
    expect(result).toBe(1);
    // Explicit, because `1 == true` in JS and a loose assertion would have passed while
    // the hole was open.
    expect(typeof result).toBe('number');
    expect(result).not.toBe(true);
  });

  test('other counts parse as numbers', () => {
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('0')).toBe(0);
    expect(typeof parseTrustProxy('0')).toBe('number');
  });

  test('absent or blank trusts nothing — never a silent true', () => {
    for (const raw of [undefined, null, '', '   ']) {
      expect(parseTrustProxy(raw)).toBe(false);
    }
  });

  test('the boolean words still work', () => {
    for (const raw of ['true', 'TRUE', 'yes', 'on']) expect(parseTrustProxy(raw)).toBe(true);
    for (const raw of ['false', 'FALSE', 'no', 'off']) expect(parseTrustProxy(raw)).toBe(false);
  });

  test('an address is not truncated to a hop count by a lenient parseInt', () => {
    // '1.2.3.4' would become the number 1 under Number.parseInt alone, which would trust one
    // hop while the operator believed they had named a single trusted address.
    expect(parseTrustProxy('1.2.3.4')).toBe('1.2.3.4');
    expect(parseTrustProxy('10.0.0.1, 10.0.0.2')).toBe('10.0.0.1, 10.0.0.2');
    expect(parseTrustProxy('loopback')).toBe('loopback');
  });

  test('surrounding whitespace does not change the meaning', () => {
    expect(parseTrustProxy('  1  ')).toBe(1);
    expect(parseTrustProxy('  true  ')).toBe(true);
  });
});
