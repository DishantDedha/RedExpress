import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { KM_PER_DEGREE_LAT, haversineKm, toRadians } from '../../src/services/geo.js';
import {
  app,
  createDonor,
  createStaff,
  disconnect,
  loginByOtp,
  loginStaff,
  resetFixtures,
  testPhone,
} from './helpers.js';

/**
 * Proximity search against real Postgres — the bounding box, the exact Haversine pass, and
 * the PII rules that depend on who is asking.
 *
 * tests/geo.test.js already proves haversineKm and boundingBox in isolation. What it cannot
 * prove is that the two-step query composes: that the indexed `latitude BETWEEN … AND
 * longitude BETWEEN …` narrows to a superset, that the JS distance pass then drops the
 * corners of that rectangle, and that the survivors come back nearest-first. Those are
 * properties of the query, not of the arithmetic, so they need a database.
 *
 * ## Isolation from seeded data
 *
 * The fixtures sit near Bengaluru and carry a district name nothing else uses, while
 * prisma/seed.js puts its thirty donors across Odisha, ~1,300 km away. Every query below
 * filters on that district as well as the radius, so a developer's seed — or its absence —
 * cannot change a single assertion.
 */

// Bengaluru. Deliberately nowhere near the seeded Odisha donors.
const ORIGIN = { latitude: 12.9716, longitude: 77.5946 };
const DISTRICT = 'Integration Proximity District';

/**
 * A point `northKm` north and `eastKm` east of the origin.
 *
 * Longitude degrees shrink as cos(latitude), so the east offset is scaled — otherwise a
 * "10 km east" fixture would sit 9.7 km east at this latitude and the corner test below
 * would be measuring the wrong thing.
 */
function offset(northKm, eastKm = 0) {
  const latitude = ORIGIN.latitude + northKm / KM_PER_DEGREE_LAT;
  const longitude = ORIGIN.longitude + eastKm / (KM_PER_DEGREE_LAT * Math.cos(toRadians(latitude)));
  return { latitude, longitude };
}

/** Actual great-circle distance from the origin, for asserting against the API's answer. */
function distanceFrom(point) {
  return haversineKm(ORIGIN.latitude, ORIGIN.longitude, point.latitude, point.longitude);
}

const FIXTURES = {
  near: { phoneIndex: 30, name: 'Near Donor', ...offset(2) },
  mid: { phoneIndex: 31, name: 'Mid Donor', ...offset(8) },
  far: { phoneIndex: 32, name: 'Far Donor', ...offset(20) },
  // Inside the bounding box for a 10 km radius (10 north AND 10 east are both within the
  // rectangle) but ~14.1 km away as the crow flies. This donor is the whole reason the
  // exact Haversine pass exists: a box-only query would wrongly return them.
  corner: { phoneIndex: 33, name: 'Corner Donor', ...offset(10, 10) },
  unavailable: { phoneIndex: 34, name: 'Unavailable Donor', ...offset(3), isAvailable: false },
  dead: { phoneIndex: 35, name: 'Dead Donor', ...offset(3), status: 'DEAD' },
  // A different blood group, for the compatibility test. O- gives to everyone.
  universal: { phoneIndex: 36, name: 'Universal Donor', bloodGroup: 'O_NEG', ...offset(4) },
  // No coordinates at all: findable by district, invisible to any radius query.
  unplaced: { phoneIndex: 37, name: 'Unplaced Donor', latitude: null, longitude: null },
};

let donors;
let searcherToken;
let staffToken;

beforeAll(async () => {
  await resetFixtures();

  donors = {};
  for (const [key, spec] of Object.entries(FIXTURES)) {
    donors[key] = await createDonor({ state: 'Karnataka', district: DISTRICT, city: 'Bengaluru', ...spec });
  }

  // A receiver does the searching, so nothing is filtered out for being the caller.
  searcherToken = (await loginByOtp(request, testPhone(38), 'RECEIVER')).accessToken;

  const staff = await createStaff({ role: 'STAFF' });
  staffToken = (await loginStaff(request, staff.email, staff.password)).accessToken;
});

afterAll(async () => {
  await resetFixtures();
  await disconnect();
});

/** Runs a search as the receiver unless another token is given. */
function search(query, token = searcherToken) {
  return request(app)
    .get('/donors/search')
    .query({ district: DISTRICT, ...query })
    .set('Authorization', `Bearer ${token}`);
}

const idsOf = (response) => response.body.results.map((row) => row.userId);

describe('proximity search', () => {
  test('returns only donors inside the radius, nearest first', async () => {
    const response = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 25 });

    expect(response.status).toBe(200);
    expect(response.body.mode).toBe('proximity');
    expect(idsOf(response)).toEqual([donors.near.id, donors.mid.id, donors.corner.id, donors.far.id]);
    expect(response.body.total).toBe(4);
  });

  test('a tighter radius drops the ones outside it', async () => {
    const response = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 5 });

    expect(idsOf(response)).toEqual([donors.near.id]);
    expect(response.body.radiusKm).toBe(5);
  });

  test('drops the corners of the bounding box', async () => {
    // The corner donor is 10 km north AND 10 km east: inside the rectangle a 10 km radius
    // produces, ~14.1 km away in reality. If the exact pass were skipped they would appear.
    expect(distanceFrom(FIXTURES.corner)).toBeCloseTo(Math.hypot(10, 10), 1);

    const response = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 10 });

    expect(idsOf(response)).toEqual([donors.near.id, donors.mid.id]);
    expect(idsOf(response)).not.toContain(donors.corner.id);

    // Widen past the true distance and they appear — so they were excluded for being far,
    // not for being missing.
    const wider = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 15 });
    expect(idsOf(wider)).toContain(donors.corner.id);
  });

  test('the reported distance matches the Haversine formula', async () => {
    const response = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 25 }, staffToken);

    const byId = Object.fromEntries(response.body.results.map((row) => [row.userId, row]));

    // Staff see the fine value, so this is a direct comparison with the pure function.
    expect(byId[donors.near.id].distanceKm).toBeCloseTo(distanceFrom(FIXTURES.near), 1);
    expect(byId[donors.mid.id].distanceKm).toBeCloseTo(distanceFrom(FIXTURES.mid), 1);
    expect(byId[donors.far.id].distanceKm).toBeCloseTo(distanceFrom(FIXTURES.far), 1);
  });

  test('a donor with no coordinates never appears in a radius search', async () => {
    const proximity = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 500 });
    expect(idsOf(proximity)).not.toContain(donors.unplaced.id);

    // But they are still findable the way the mockup's three dropdowns find people, which
    // is the entire reason the administrative mode exists.
    const area = await search({ bloodGroup: 'O_POS' });
    expect(area.body.mode).toBe('area');
    expect(idsOf(area)).toContain(donors.unplaced.id);
  });
});

describe('who is excluded', () => {
  test('unavailable donors, unless availableOnly is turned off', async () => {
    const strict = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 25 });
    expect(idsOf(strict)).not.toContain(donors.unavailable.id);

    const loose = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 25, availableOnly: 'false' });
    expect(idsOf(loose)).toContain(donors.unavailable.id);
  });

  test('donors who are not ACTIVE, whatever the caller asks for', async () => {
    const response = await search({
      bloodGroup: 'O_POS',
      ...ORIGIN,
      radiusKm: 25,
      availableOnly: 'false',
    });

    // No query parameter can surface a DEAD donor — that is what makes mark-dead worth
    // pressing.
    expect(idsOf(response)).not.toContain(donors.dead.id);
  });

  test('an unauthenticated caller gets nothing at all', async () => {
    const response = await request(app).get('/donors/search').query({ district: DISTRICT });

    expect(response.status).toBe(401);
  });
});

describe('blood group compatibility', () => {
  test('an exact-group search does not return other groups', async () => {
    const response = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 25 });

    expect(idsOf(response)).not.toContain(donors.universal.id);
  });

  test('compatible=true pulls in donors whose blood is safe for the patient', async () => {
    const response = await search({ bloodGroup: 'O_POS', compatible: 'true', ...ORIGIN, radiusKm: 25 });

    // O- is the universal donor, so an O+ patient can take from them.
    expect(idsOf(response)).toContain(donors.universal.id);
    expect(response.body.filters.compatibleGroups).toEqual(expect.arrayContaining(['O_POS', 'O_NEG']));
  });
});

describe('what each caller is allowed to see', () => {
  test('an app user gets contact details but not a home address', async () => {
    const response = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 25 });
    const row = response.body.results[0];

    // Enough to ring someone — which is the product.
    expect(row.name).toBe('Near Donor');
    expect(row.phone).toBe(testPhone(FIXTURES.near.phoneIndex));
    expect(row.city).toBe('Bengaluru');

    // Not enough to find them.
    expect(row.address).toBeUndefined();
    expect(row.pincode).toBeUndefined();
    expect(row.latitude).toBeUndefined();
    expect(row.longitude).toBeUndefined();
  });

  test('the distance shown to an app user is coarse enough not to be an address', async () => {
    const response = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 25 });
    const row = response.body.results[0];

    expect(row.distanceIsApproximate).toBe(true);
    // Snapped to 500 m: three searches from three positions intersect to an area rather
    // than a point, so the number cannot be trilaterated back into a doorstep.
    expect(row.distanceKm * 2).toBe(Math.round(row.distanceKm * 2));
    expect(row.distanceKm).toBeCloseTo(distanceFrom(FIXTURES.near), 0);
  });

  test('staff get the full record, because they are the ones dispatching', async () => {
    const response = await search({ bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 25 }, staffToken);
    const row = response.body.results[0];

    expect(row.address).toContain('Test Lane');
    expect(row.pincode).toBe('751001');
    expect(row.latitude).toBeCloseTo(FIXTURES.near.latitude, 4);
    expect(row.status).toBe('ACTIVE');
    expect(row.distanceIsApproximate).toBe(false);
  });
});

describe('paging', () => {
  test('pages a sorted result set without repeating or losing anyone', async () => {
    const query = { bloodGroup: 'O_POS', ...ORIGIN, radiusKm: 25, pageSize: 2 };

    const first = await search({ ...query, page: 1 });
    const second = await search({ ...query, page: 2 });

    expect(first.body.total).toBe(4);
    expect(first.body.hasMore).toBe(true);
    expect(second.body.hasMore).toBe(false);

    // Paging happens after the distance sort, so the two pages are the one ordered list.
    expect([...idsOf(first), ...idsOf(second)]).toEqual([
      donors.near.id,
      donors.mid.id,
      donors.corner.id,
      donors.far.id,
    ]);
  });
});
