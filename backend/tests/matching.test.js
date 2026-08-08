import { describe, expect, test } from '@jest/globals';
import {
  BLOOD_GROUPS,
  COMPATIBILITY,
  bloodGroupLabel,
  canDonate,
  donorGroupsFor,
  expandingRadiusSearch,
  rankByDistance,
  recipientGroupsFor,
  searchableDonorGroups,
  withinRadius,
} from '../src/services/matching.js';

describe('blood group compatibility', () => {
  /**
   * The authoritative table, written out by hand from a transfusion chart so it is an
   * independent check on the antigen logic rather than a restatement of it. If these two
   * ever disagree, believe this one and fix the code.
   */
  const EXPECTED = {
    O_NEG: ['O_NEG'],
    O_POS: ['O_NEG', 'O_POS'],
    A_NEG: ['O_NEG', 'A_NEG'],
    A_POS: ['O_NEG', 'O_POS', 'A_NEG', 'A_POS'],
    B_NEG: ['O_NEG', 'B_NEG'],
    B_POS: ['O_NEG', 'O_POS', 'B_NEG', 'B_POS'],
    AB_NEG: ['O_NEG', 'A_NEG', 'B_NEG', 'AB_NEG'],
    AB_POS: ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'],
  };

  test.each(Object.entries(EXPECTED))('a %s patient can receive from exactly the right groups', (recipient, donors) => {
    expect(donorGroupsFor(recipient).sort()).toEqual([...donors].sort());
  });

  test('O negative is the universal donor', () => {
    expect(recipientGroupsFor('O_NEG').sort()).toEqual([...BLOOD_GROUPS].sort());
  });

  test('AB positive is the universal recipient', () => {
    expect(donorGroupsFor('AB_POS').sort()).toEqual([...BLOOD_GROUPS].sort());
  });

  test('AB positive can only donate to AB positive', () => {
    expect(recipientGroupsFor('AB_POS')).toEqual(['AB_POS']);
  });

  test('rhesus positive blood never goes to a negative patient', () => {
    for (const donor of BLOOD_GROUPS.filter((g) => g.endsWith('_POS'))) {
      for (const recipient of BLOOD_GROUPS.filter((g) => g.endsWith('_NEG'))) {
        expect(canDonate(donor, recipient)).toBe(false);
      }
    }
  });

  test('everyone can donate to themselves', () => {
    for (const group of BLOOD_GROUPS) {
      expect(canDonate(group, group)).toBe(true);
    }
  });

  test('compatibility is not symmetric', () => {
    expect(canDonate('O_NEG', 'AB_POS')).toBe(true);
    expect(canDonate('AB_POS', 'O_NEG')).toBe(false);
  });

  test('an unknown group is never compatible', () => {
    expect(canDonate('Z_POS', 'A_POS')).toBe(false);
    expect(canDonate('A_POS', undefined)).toBe(false);
    expect(donorGroupsFor('nonsense')).toEqual([]);
  });

  test('the exported map matches the function and is frozen', () => {
    for (const group of BLOOD_GROUPS) {
      expect(COMPATIBILITY[group]).toEqual(donorGroupsFor(group));
    }
    expect(Object.isFrozen(COMPATIBILITY)).toBe(true);
  });

  test('searchableDonorGroups narrows by default and widens on request', () => {
    expect(searchableDonorGroups('A_POS')).toEqual(['A_POS']);
    expect(searchableDonorGroups('A_POS', { compatible: true }).sort()).toEqual(
      ['O_NEG', 'O_POS', 'A_NEG', 'A_POS'].sort(),
    );
    // No group asked for means no group filter at all.
    expect(searchableDonorGroups(undefined, { compatible: true })).toBeNull();
  });

  test('labels are words, not symbols a screen reader will skip', () => {
    expect(bloodGroupLabel('O_NEG')).toBe('O negative');
    expect(bloodGroupLabel('AB_POS')).toBe('AB positive');
  });
});

describe('rankByDistance', () => {
  const origin = { latitude: 20.2961, longitude: 85.8245 }; // Bhubaneswar

  const donors = [
    { userId: 'far', latitude: 20.4625, longitude: 85.8828 }, // Cuttack, ~19.5 km
    { userId: 'near', latitude: 20.3, longitude: 85.83 }, // ~0.7 km
    { userId: 'unknown', latitude: null, longitude: null },
    { userId: 'middle', latitude: 20.35, longitude: 85.85 }, // ~6.3 km
  ];

  test('sorts nearest first and attaches a rounded distance', () => {
    const ranked = rankByDistance(donors, origin);
    expect(ranked.map((d) => d.userId)).toEqual(['near', 'middle', 'far', 'unknown']);
    expect(ranked[0].distanceKm).toBeLessThan(1);
    expect(ranked[2].distanceKm).toBeCloseTo(19.5, 0);
  });

  test('donors with no coordinates get null and sort last, not zero and first', () => {
    const ranked = rankByDistance(donors, origin);
    expect(ranked.at(-1)).toMatchObject({ userId: 'unknown', distanceKm: null });
  });

  test('an origin with no coordinates leaves every distance null', () => {
    const ranked = rankByDistance(donors, { latitude: null, longitude: null });
    expect(ranked.every((d) => d.distanceKm === null)).toBe(true);
    expect(ranked).toHaveLength(donors.length);
  });

  test('does not mutate its input', () => {
    const copy = donors.map((d) => ({ ...d }));
    rankByDistance(donors, origin);
    expect(donors).toEqual(copy);
  });

  test('withinRadius drops the far ones but keeps the unmeasurable ones', () => {
    const kept = withinRadius(rankByDistance(donors, origin), 10);
    expect(kept.map((d) => d.userId)).toEqual(['near', 'middle', 'unknown']);
  });
});

describe('expandingRadiusSearch', () => {
  /** Fake search: N donors are "available" at each radius, and the calls are recorded. */
  function fakeSearch(byRadius, calls = []) {
    return async (radiusKm) => {
      calls.push(radiusKm);
      return Array.from({ length: byRadius[radiusKm] ?? 0 }, (_, i) => ({ userId: `${radiusKm}-${i}` }));
    };
  }

  test('stops at the first radius that meets the minimum', async () => {
    const calls = [];
    const result = await expandingRadiusSearch({
      radii: [5, 10, 25, 50],
      minCandidates: 20,
      search: fakeSearch({ 5: 3, 10: 25, 25: 90, 50: 300 }, calls),
    });

    expect(result.radiusKm).toBe(10);
    expect(result.candidates).toHaveLength(25);
    expect(result.reachedMinimum).toBe(true);
    // 25 and 50 km were never queried — a dense city does not wake the whole district.
    expect(calls).toEqual([5, 10]);
    expect(result.steps).toEqual([
      { radiusKm: 5, found: 3 },
      { radiusKm: 10, found: 25 },
    ]);
  });

  test('does not expand at all when the innermost radius is enough', async () => {
    const calls = [];
    const result = await expandingRadiusSearch({
      radii: [5, 10, 25, 50],
      minCandidates: 20,
      search: fakeSearch({ 5: 40 }, calls),
    });

    expect(result.radiusKm).toBe(5);
    expect(calls).toEqual([5]);
  });

  test('returns the widest result it found when nothing reaches the minimum', async () => {
    const calls = [];
    const result = await expandingRadiusSearch({
      radii: [5, 10, 25, 50],
      minCandidates: 20,
      search: fakeSearch({ 5: 0, 10: 1, 25: 3, 50: 7 }, calls),
    });

    // Seven donors an hour away beat none at all.
    expect(result.radiusKm).toBe(50);
    expect(result.candidates).toHaveLength(7);
    expect(result.reachedMinimum).toBe(false);
    expect(calls).toEqual([5, 10, 25, 50]);
  });

  test('an empty result is reported honestly rather than as an error', async () => {
    const result = await expandingRadiusSearch({
      radii: [5, 50],
      minCandidates: 20,
      search: fakeSearch({}),
    });

    expect(result.candidates).toEqual([]);
    expect(result.reachedMinimum).toBe(false);
    expect(result.steps).toEqual([
      { radiusKm: 5, found: 0 },
      { radiusKm: 50, found: 0 },
    ]);
  });

  test('walks the radii smallest-first even if configured out of order', async () => {
    const calls = [];
    await expandingRadiusSearch({
      radii: [50, 5, 25, 10],
      minCandidates: 1000,
      search: fakeSearch({}, calls),
    });
    expect(calls).toEqual([5, 10, 25, 50]);
  });

  test('a minimum of zero still runs the innermost search once', async () => {
    const calls = [];
    const result = await expandingRadiusSearch({ radii: [5, 10], minCandidates: 0, search: fakeSearch({}, calls) });
    expect(calls).toEqual([5]);
    expect(result.reachedMinimum).toBe(true);
  });

  test('refuses to run without a search function', async () => {
    await expect(expandingRadiusSearch({ radii: [5] })).rejects.toThrow(TypeError);
  });
});
