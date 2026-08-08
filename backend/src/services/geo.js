/**
 * Distance maths. Pure functions only — no database, no config, no imports — so the
 * whole module is trivially unit-testable (tests/geo.test.js).
 *
 * There is no PostGIS in this system. Proximity search is a two-step affair:
 *
 *   1. boundingBox() gives a lat/lng rectangle that Postgres can answer from the plain
 *      btree index on DonorProfile(latitude, longitude). Cheap, indexed, and slightly
 *      too generous — a rectangle around a circle includes the corners.
 *   2. haversineKm() then measures the survivors exactly in JS and the callers drop
 *      anything past the radius.
 *
 * Step 1 without step 2 would return donors up to ~41% further away than asked
 * (the corner of the square); step 2 without step 1 would mean reading every donor row.
 */

/** IUGG mean Earth radius. Good to ~0.5% anywhere, which is far finer than we need. */
export const EARTH_RADIUS_KM = 6371.0088;

/** Kilometres per degree of latitude. Constant everywhere; longitude is not. */
export const KM_PER_DEGREE_LAT = (Math.PI * EARTH_RADIUS_KM) / 180;

export function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/** True for a finite number in range — coordinates arrive from clients and from null columns. */
export function isValidLatitude(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= -90 && value <= 90;
}

export function isValidLongitude(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180;
}

export function hasCoordinates(point) {
  return Boolean(point) && isValidLatitude(point.latitude) && isValidLongitude(point.longitude);
}

/**
 * Great-circle distance in kilometres between two points.
 *
 * Uses the haversine form rather than the spherical law of cosines because the latter
 * loses precision for short distances — and almost every distance here is short.
 * Returns NaN if any argument is not a usable coordinate, so a donor with a null
 * position can never silently sort as "0 km away".
 */
export function haversineKm(lat1, lng1, lat2, lng2) {
  if (!isValidLatitude(lat1) || !isValidLatitude(lat2)) return NaN;
  if (!isValidLongitude(lng1) || !isValidLongitude(lng2)) return NaN;

  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);

  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(phi1) * Math.cos(phi2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * The smallest lat/lng rectangle that fully contains the circle of `radiusKm` around
 * (lat, lng). Everything inside the radius is inside the box; the reverse is not true,
 * which is why callers must still measure with haversineKm.
 *
 * Returns:
 *   minLat, maxLat            always a single range, clamped to the poles
 *   minLng, maxLng            the nominal range, normalised into [-180, 180]
 *   wrapsAntimeridian         true when the box crosses the 180° line, so a single
 *                             `longitude BETWEEN min AND max` would be empty rather than wrong
 *   coversAllLongitudes       true when the circle swallows a pole and longitude stops
 *                             constraining anything
 *
 * Red Express runs in Odisha, where none of the edge cases fire. They are handled anyway
 * because the alternative is a query that silently returns nothing, which is exactly the
 * kind of bug that only shows up in production.
 */
export function boundingBox(lat, lng, radiusKm) {
  if (!isValidLatitude(lat) || !isValidLongitude(lng)) {
    throw new TypeError('boundingBox requires a valid latitude and longitude');
  }
  if (!Number.isFinite(radiusKm) || radiusKm < 0) {
    throw new TypeError('boundingBox requires a non-negative radiusKm');
  }

  // Angular radius of the circle, in radians of arc.
  const angularRadius = radiusKm / EARTH_RADIUS_KM;

  const latDelta = radiusKm / KM_PER_DEGREE_LAT;
  const minLat = lat - latDelta;
  const maxLat = lat + latDelta;

  // A degree of longitude shrinks as cos(latitude); at the pole it vanishes. If the box
  // reaches over a pole, or the ratio below leaves the domain of asin, longitude no
  // longer bounds anything and every meridian is in range.
  const sinRatio = Math.sin(angularRadius) / Math.cos(toRadians(lat));
  const coversAllLongitudes = maxLat >= 90 || minLat <= -90 || !(sinRatio < 1);

  if (coversAllLongitudes) {
    return {
      minLat: clamp(minLat, -90, 90),
      maxLat: clamp(maxLat, -90, 90),
      minLng: -180,
      maxLng: 180,
      wrapsAntimeridian: false,
      coversAllLongitudes: true,
    };
  }

  // The exact half-width of the circle in longitude. The obvious latDelta / cos(lat) is
  // very slightly too NARROW — the easternmost point of a circle on a sphere does not sit
  // at the centre's latitude — which would let the query miss a donor sitting exactly on
  // the boundary. Only millimetres at these radii, but the fix costs one asin.
  const lngDelta = (Math.asin(sinRatio) * 180) / Math.PI;
  const rawMin = lng - lngDelta;
  const rawMax = lng + lngDelta;

  return {
    minLat: clamp(minLat, -90, 90),
    maxLat: clamp(maxLat, -90, 90),
    minLng: normalizeLongitude(rawMin),
    maxLng: normalizeLongitude(rawMax),
    wrapsAntimeridian: rawMin < -180 || rawMax > 180,
    coversAllLongitudes: false,
  };
}

/** Folds any longitude into [-180, 180]. */
export function normalizeLongitude(lng) {
  if (lng >= -180 && lng <= 180) return lng;
  const wrapped = ((((lng + 180) % 360) + 360) % 360) - 180;
  return wrapped;
}

/**
 * The box's longitude span expressed as one or two plain BETWEEN ranges, ready to drop
 * into a WHERE clause. A box that crosses the antimeridian becomes two ranges joined by
 * OR — `BETWEEN 179 AND -179` matches nothing.
 */
export function longitudeRanges(box) {
  if (box.coversAllLongitudes) return [[-180, 180]];
  if (!box.wrapsAntimeridian) return [[box.minLng, box.maxLng]];
  return [
    [box.minLng, 180],
    [-180, box.maxLng],
  ];
}

/** Rounds a distance for display. One decimal is the resolution a person can act on. */
export function roundKm(km, decimals = 1) {
  if (!Number.isFinite(km)) return null;
  const factor = 10 ** decimals;
  return Math.round(km * factor) / factor;
}

/** Default grid for coarseKm — 500 m, see below. */
export const COARSE_DISTANCE_STEP_KM = 0.5;

/**
 * Snaps a distance to a coarse grid, for distances shown to people who are not staff.
 *
 * A donor's street address is never returned to another app user — but a distance is, and a
 * distance is a circle. Three searches from three different phone positions intersect three
 * circles at one point, which is trilateration: with the 100 m precision `roundKm` gives, a
 * determined searcher recovers a stranger's home to within about a house. That is the exact
 * thing withholding the address was for.
 *
 * Snapping to 500 m widens each circle into a 500 m band, so the intersection is an area
 * rather than a point, and repeating the search does not narrow it — the same donor at the
 * same place always reports the same rounded number, so averaging away the noise is not
 * available either. "2.5 km away" is just as useful for deciding who to call as "2.47 km".
 *
 * Staff keep the fine value: they have the address anyway, and they are dispatching.
 */
export function coarseKm(km, stepKm = COARSE_DISTANCE_STEP_KM) {
  if (!Number.isFinite(km)) return null;
  // Never report 0 — "0 km away" says "this person is where you are standing".
  const snapped = Math.round(km / stepKm) * stepKm;
  const value = snapped === 0 ? stepKm : snapped;
  // Kill the float dust that 0.1-style steps leave behind (0.30000000000000004).
  return Math.round(value * 100) / 100;
}
