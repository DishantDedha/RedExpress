import { describe, expect, test } from '@jest/globals';
import { MANUAL_CALL_OUTCOMES, latestCallByDonor } from '../src/services/callLogService.js';
import { crmUserRow, startOfToday } from '../src/services/crmService.js';

/**
 * The CRM is mostly database work, so only the decisions that can be got wrong without
 * Postgres noticing are unit-tested here: which call is "the last one", what a table row
 * says about someone with a half-finished registration, and where "today" begins.
 *
 * The behaviour that actually matters — mark dead invalidating a session, OTP re-login
 * bringing a donor back — needs the real database and lives in scripts/smoke-crm.mjs.
 */

function call(donorUserId, createdAt, outcome = 'NO_ANSWER') {
  return { id: `${donorUserId}-${createdAt}`, donorUserId, outcome, createdAt: new Date(createdAt) };
}

describe('latestCallByDonor', () => {
  test('keeps the newest call per donor', () => {
    const latest = latestCallByDonor([
      call('a', '2026-08-01T09:00:00Z'),
      call('a', '2026-08-03T09:00:00Z', 'PICKED_UP'),
      call('b', '2026-08-02T09:00:00Z'),
    ]);

    expect(latest.get('a').outcome).toBe('PICKED_UP');
    expect(latest.get('b').createdAt.toISOString()).toBe('2026-08-02T09:00:00.000Z');
  });

  test('does not depend on the input being sorted', () => {
    const ascending = latestCallByDonor([call('a', '2026-08-01T09:00:00Z'), call('a', '2026-08-05T09:00:00Z', 'WRONG_NUMBER')]);
    const descending = latestCallByDonor([call('a', '2026-08-05T09:00:00Z', 'WRONG_NUMBER'), call('a', '2026-08-01T09:00:00Z')]);

    expect(ascending.get('a').outcome).toBe('WRONG_NUMBER');
    expect(descending.get('a').outcome).toBe('WRONG_NUMBER');
  });

  test('is empty for a donor nobody has rung', () => {
    expect(latestCallByDonor([]).size).toBe(0);
  });
});

describe('MANUAL_CALL_OUTCOMES', () => {
  // MARKED_DEAD carries a status change and a token bump with it, so it must only ever be
  // written by markUserDead. If it leaks into this list, staff can strand a donor's
  // session from the ordinary call form without any of that happening.
  test('excludes MARKED_DEAD', () => {
    expect(MANUAL_CALL_OUTCOMES).toEqual(['PICKED_UP', 'NO_ANSWER', 'WRONG_NUMBER']);
    expect(MANUAL_CALL_OUTCOMES).not.toContain('MARKED_DEAD');
  });
});

describe('crmUserRow', () => {
  const donorUser = {
    id: 'u1',
    name: 'Sradha Mohanty',
    phone: '+919876500001',
    email: null,
    role: 'DONOR',
    status: 'ACTIVE',
    isPhoneVerified: true,
    createdAt: new Date('2026-01-01'),
    state: null,
    district: null,
    city: null,
    donorProfile: {
      bloodGroup: 'O_NEG',
      isAvailable: true,
      lastDonationDate: null,
      state: 'Odisha',
      district: 'Khordha',
      city: 'Bhubaneswar',
    },
  };

  test('flattens the donor profile onto the row', () => {
    const row = crmUserRow(donorUser, { lastCall: null, callCount: 0 });

    expect(row.bloodGroup).toBe('O_NEG');
    // Spoken form, not "O-": staff dashboards get read aloud too.
    expect(row.bloodGroupLabel).toBe('O negative');
    expect(row.district).toBe('Khordha');
    expect(row.profileComplete).toBe(true);
  });

  test('falls back to the user row for a receiver, who has no profile', () => {
    const row = crmUserRow(
      { ...donorUser, role: 'RECEIVER', donorProfile: null, state: 'Odisha', district: 'Cuttack', city: 'Cuttack' },
      undefined,
    );

    expect(row.bloodGroup).toBeNull();
    expect(row.district).toBe('Cuttack');
    expect(row.callCount).toBe(0);
  });

  test('flags a donor who verified a phone but never finished registering', () => {
    const row = crmUserRow({ ...donorUser, name: '', donorProfile: null }, undefined);

    expect(row.profileComplete).toBe(false);
    // Blank rather than an empty string, so the CRM shows a placeholder instead of nothing.
    expect(row.name).toBeNull();
  });
});

describe('startOfToday', () => {
  test('is local midnight, because a shift metric follows the staff\'s clock', () => {
    const start = startOfToday(new Date(2026, 7, 6, 14, 32, 5));

    expect(start.getFullYear()).toBe(2026);
    expect(start.getDate()).toBe(6);
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getSeconds()).toBe(0);
    expect(start.getMilliseconds()).toBe(0);
  });
});
