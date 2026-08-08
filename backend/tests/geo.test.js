import { describe, expect, test } from '@jest/globals';
import {
  EARTH_RADIUS_KM,
  boundingBox,
  hasCoordinates,
  haversineKm,
  longitudeRanges,
  normalizeLongitude,
  roundKm,
} from '../src/services/geo.js';

/**
 * Reference points around Odisha, where the app actually runs. The expected distances are
 * great-circle values from an independent calculator, so these tests would catch a
 * transposed argument or a degrees/radians slip rather than just re-deriving the formula.
 */
const BHUBANESWAR = { latitude: 20.2961, longitude: 85.8245 };
const CUTTACK = { latitude: 20.4625, longitude: 85.8828 };
const PURI = { latitude: 19.8135, longitude: 85.8312 };
const ROURKELA = { latitude: 22.2604, longitude: 84.8536 };

describe('haversineKm', () => {
  test('measures a short intra-district hop', () => {
    // Bhubaneswar -> Cuttack is about 19.5 km as the crow flies.
    const km = haversineKm(BHUBANESWAR.latitude, BHUBANESWAR.longitude, CUTTACK.latitude, CUTTACK.longitude);
    expect(km).toBeCloseTo(19.5, 0);
  });

  test('measures a longer cross-state hop', () => {
    // Bhubaneswar -> Rourkela is about 240 km in a straight line. (The road is ~340 km;
    // this function measures the crow, and every caller must remember that.)
    const km = haversineKm(BHUBANESWAR.latitude, BHUBANESWAR.longitude, ROURKELA.latitude, ROURKELA.longitude);
    expect(km).toBeCloseTo(240.5, -1);
  });

  test('is zero for the same point', () => {
    expect(haversineKm(20.2961, 85.8245, 20.2961, 85.8245)).toBe(0);
  });

  test('is symmetric', () => {
    const there = haversineKm(BHUBANESWAR.latitude, BHUBANESWAR.longitude, PURI.latitude, PURI.longitude);
    const back = haversineKm(PURI.latitude, PURI.longitude, BHUBANESWAR.latitude, BHUBANESWAR.longitude);
    expect(there).toBeCloseTo(back, 9);
  });

  test('one degree of latitude is about 111 km anywhere', () => {
    expect(haversineKm(0, 0, 1, 0)).toBeCloseTo(111.19, 1);
    expect(haversineKm(60, 30, 61, 30)).toBeCloseTo(111.19, 1);
  });

  test('a degree of longitude shrinks towards the pole', () => {
    const atEquator = haversineKm(0, 0, 0, 1);
    const atSixty = haversineKm(60, 0, 60, 1);
    expect(atSixty).toBeCloseTo(atEquator / 2, 0);
  });

  test('handles antipodal points without NaN from a rounding overshoot', () => {
    // sqrt(a) can drift just past 1 here; asin would return NaN if it were not clamped.
    const km = haversineKm(0, 0, 0, 180);
    expect(km).toBeCloseTo(Math.PI * EARTH_RADIUS_KM, 3);
  });

  test('returns NaN rather than 0 for a missing coordinate', () => {
    // A donor with a null position must never sort as "0 km away".
    expect(haversineKm(null, null, 20, 85)).toBeNaN();
    expect(haversineKm(20, 85, undefined, undefined)).toBeNaN();
    expect(haversineKm(200, 85, 20, 85)).toBeNaN();
  });
});

/**
 * Exact point at `distanceKm` from (lat, lng) on the given bearing, on a sphere. Used to
 * generate a true circle to test the box against — a flat-earth approximation here would
 * only prove the box agrees with the same approximation.
 */
function destination(lat, lng, distanceKm, bearingDegrees) {
  const R = EARTH_RADIUS_KM;
  const d = distanceKm / R;
  const theta = (bearingDegrees * Math.PI) / 180;
  const phi1 = (lat * Math.PI) / 180;
  const lambda1 = (lng * Math.PI) / 180;

  const phi2 = Math.asin(Math.sin(phi1) * Math.cos(d) + Math.cos(phi1) * Math.sin(d) * Math.cos(theta));
  const lambda2 =
    lambda1 +
    Math.atan2(Math.sin(theta) * Math.sin(d) * Math.cos(phi1), Math.cos(d) - Math.sin(phi1) * Math.sin(phi2));

  return { latitude: (phi2 * 180) / Math.PI, longitude: (lambda2 * 180) / Math.PI };
}

describe('boundingBox', () => {
  test('contains every point on the true circle', () => {
    // The property the whole design rests on: if the box can miss a point inside the
    // radius, the indexed pre-filter silently loses donors and no later step can recover
    // them. Walked at 1-degree bearings, so the east/west extremes are hit closely.
    const radiusKm = 25;
    const box = boundingBox(BHUBANESWAR.latitude, BHUBANESWAR.longitude, radiusKm);

    for (let bearing = 0; bearing < 360; bearing += 1) {
      const point = destination(BHUBANESWAR.latitude, BHUBANESWAR.longitude, radiusKm, bearing);

      expect(point.latitude).toBeGreaterThanOrEqual(box.minLat);
      expect(point.latitude).toBeLessThanOrEqual(box.maxLat);
      expect(point.longitude).toBeGreaterThanOrEqual(box.minLng);
      expect(point.longitude).toBeLessThanOrEqual(box.maxLng);
    }
  });

  test('is tight — the true circle reaches all four edges', () => {
    // The other half of the property: a box far wider than the circle would be correct
    // but would drag rows into memory for no reason.
    const radiusKm = 25;
    const box = boundingBox(BHUBANESWAR.latitude, BHUBANESWAR.longitude, radiusKm);

    let maxLng = -Infinity;
    for (let bearing = 0; bearing < 360; bearing += 0.1) {
      maxLng = Math.max(maxLng, destination(BHUBANESWAR.latitude, BHUBANESWAR.longitude, radiusKm, bearing).longitude);
    }
    expect(maxLng).toBeCloseTo(box.maxLng, 6);
  });

  test('is a rectangle, so its corners are outside the circle', () => {
    // This is exactly why the caller must still run haversineKm over the survivors.
    const box = boundingBox(BHUBANESWAR.latitude, BHUBANESWAR.longitude, 10);
    const corner = haversineKm(BHUBANESWAR.latitude, BHUBANESWAR.longitude, box.maxLat, box.maxLng);
    expect(corner).toBeGreaterThan(10);
    expect(corner).toBeLessThan(15); // ~10 * sqrt(2)
  });

  test('the latitude edges sit exactly on the radius', () => {
    const box = boundingBox(BHUBANESWAR.latitude, BHUBANESWAR.longitude, 40);
    const north = haversineKm(BHUBANESWAR.latitude, BHUBANESWAR.longitude, box.maxLat, BHUBANESWAR.longitude);
    expect(north).toBeCloseTo(40, 6);
  });

  test('the longitude edges sit at or just outside the radius', () => {
    const box = boundingBox(BHUBANESWAR.latitude, BHUBANESWAR.longitude, 40);
    const east = haversineKm(BHUBANESWAR.latitude, BHUBANESWAR.longitude, BHUBANESWAR.latitude, box.maxLng);
    // Never inside 40 km: erring outwards over-selects a few rows, erring inwards loses
    // a donor. The naive latDelta / cos(lat) fails this by a hair.
    expect(east).toBeGreaterThanOrEqual(40);
    expect(east).toBeLessThan(40.1);
  });

  test('widens with latitude for the same radius', () => {
    const nearEquator = boundingBox(0, 80, 50);
    const farNorth = boundingBox(60, 80, 50);
    const span = (box) => box.maxLng - box.minLng;
    expect(span(farNorth)).toBeGreaterThan(span(nearEquator) * 1.9);
  });

  test('flags a box that crosses the antimeridian', () => {
    const box = boundingBox(0, 179.9, 50);
    expect(box.wrapsAntimeridian).toBe(true);
    expect(box.minLng).toBeGreaterThan(0);
    expect(box.maxLng).toBeLessThan(0);
    // A single BETWEEN would be empty; two ranges are needed.
    expect(longitudeRanges(box)).toEqual([
      [box.minLng, 180],
      [-180, box.maxLng],
    ]);
  });

  test('gives up on longitude when the circle swallows a pole', () => {
    const box = boundingBox(89.9, 30, 200);
    expect(box.coversAllLongitudes).toBe(true);
    expect(box.maxLat).toBe(90);
    expect(longitudeRanges(box)).toEqual([[-180, 180]]);
  });

  test('clamps latitude to the poles', () => {
    expect(boundingBox(-89.5, 0, 500).minLat).toBe(-90);
  });

  test('a normal box is one plain range', () => {
    const box = boundingBox(BHUBANESWAR.latitude, BHUBANESWAR.longitude, 10);
    expect(box.wrapsAntimeridian).toBe(false);
    expect(longitudeRanges(box)).toEqual([[box.minLng, box.maxLng]]);
  });

  test('rejects unusable input instead of returning a silently empty box', () => {
    expect(() => boundingBox(null, 85, 10)).toThrow(TypeError);
    expect(() => boundingBox(20, 85, -1)).toThrow(TypeError);
    expect(() => boundingBox(20, 200, 10)).toThrow(TypeError);
  });
});

describe('helpers', () => {
  test('normalizeLongitude folds into [-180, 180]', () => {
    expect(normalizeLongitude(85)).toBe(85);
    expect(normalizeLongitude(181)).toBeCloseTo(-179, 9);
    expect(normalizeLongitude(-181)).toBeCloseTo(179, 9);
  });

  test('roundKm keeps one decimal and rejects nonsense', () => {
    expect(roundKm(19.4732)).toBe(19.5);
    expect(roundKm(0.04)).toBe(0);
    expect(roundKm(NaN)).toBeNull();
  });

  test('hasCoordinates rejects partial and null positions', () => {
    expect(hasCoordinates(BHUBANESWAR)).toBe(true);
    expect(hasCoordinates({ latitude: 20, longitude: null })).toBe(false);
    expect(hasCoordinates(null)).toBe(false);
  });
});
