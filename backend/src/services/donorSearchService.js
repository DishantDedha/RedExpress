import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { boundingBox, coarseKm, longitudeRanges } from './geo.js';
import { bloodGroupLabel, bloodGroupShort, rankByDistance, searchableDonorGroups, withinRadius } from './matching.js';

/**
 * Donor search — the query behind the app's "Find Blood Donors" screen and, in Phase 6,
 * the CRM's people finder.
 *
 * Two modes, deliberately:
 *
 *   Administrative — state/district/city are plain indexed WHERE clauses and Postgres
 *   does the paging. This is what the mockup's three dropdowns produce, and it is the
 *   only mode available to a donor whose phone never gave up a GPS fix.
 *
 *   Proximity — lat/lng + radiusKm. The indexed bounding box narrows first, exact
 *   Haversine runs in JS, and paging happens after sorting. No PostGIS anywhere.
 *
 * The two compose: "O- donors in Cuttack district within 10 km of me" is one query.
 */

// ---------------------------------------------------------------------------
// Where-clause construction
// ---------------------------------------------------------------------------

/** Case-insensitive exact match — clients send "Khordha", "khordha" and "KHORDHA". */
function areaMatch(value) {
  return value ? { equals: value, mode: 'insensitive' } : undefined;
}

/**
 * Everything except the geography. Shared by both modes and by the matching engine, so a
 * donor can never be notified about a request they would not have shown up in search for.
 */
export function donorBaseWhere({
  bloodGroup,
  compatible = false,
  state,
  district,
  city,
  availableOnly = true,
  excludeUserIds = [],
}) {
  const groups = searchableDonorGroups(bloodGroup, { compatible });

  return {
    ...(groups ? { bloodGroup: { in: groups } } : {}),
    ...(availableOnly ? { isAvailable: true } : {}),
    ...(state ? { state: areaMatch(state) } : {}),
    ...(district ? { district: areaMatch(district) } : {}),
    ...(city ? { city: areaMatch(city) } : {}),
    user: {
      // DEAD and BLOCKED donors are invisible here. That is the whole point of the CRM's
      // mark-dead action (Phase 6): one column change removes them from search and from
      // every future notification.
      status: 'ACTIVE',
      ...(excludeUserIds.length ? { id: { notIn: excludeUserIds } } : {}),
    },
  };
}

/**
 * Adds the indexed bounding-box predicate. A box that crosses the antimeridian becomes
 * two OR'd longitude ranges — see geo.longitudeRanges.
 */
export function withBoundingBox(where, box) {
  const ranges = longitudeRanges(box);
  const latitude = { gte: box.minLat, lte: box.maxLat };

  if (ranges.length === 1) {
    return { ...where, latitude, longitude: { gte: ranges[0][0], lte: ranges[0][1] } };
  }

  return {
    ...where,
    latitude,
    OR: ranges.map(([min, max]) => ({ longitude: { gte: min, lte: max } })),
  };
}

// ---------------------------------------------------------------------------
// Result shaping
// ---------------------------------------------------------------------------

const DONOR_SELECT = {
  userId: true,
  bloodGroup: true,
  gender: true,
  isAvailable: true,
  lastDonationDate: true,
  profilePhotoUrl: true,
  state: true,
  district: true,
  city: true,
  pincode: true,
  address: true,
  latitude: true,
  longitude: true,
  user: { select: { id: true, name: true, phone: true, status: true } },
};

/** Staff run the call worklist and need the full record; app users must not have it. */
function isStaff(viewer) {
  return viewer?.role === 'STAFF' || viewer?.role === 'ADMIN';
}

/**
 * What a searcher is allowed to see about a donor.
 *
 * The rule, settled in Phase 15 and enforced in this one function so no endpoint can drift
 * from it: **an app user gets what they need to phone someone; only staff get what they
 * need to find them.**
 *
 * So a donor's name, blood group, city and phone number are returned to any signed-in
 * caller — the mockup's card has a Call button and the whole product is that call. Their
 * street address, PIN code and exact coordinates are staff-only: staff are dispatching and
 * hold the record anyway, whereas publishing where a stranger lives to anyone who can type
 * a blood group is a different and much worse product.
 *
 * The distance is coarsened for non-staff (see geo.coarseKm) because a precise distance is
 * an address with extra steps — three of them from three positions is trilateration.
 *
 * `status` is staff-only too, and not for privacy: a DEAD or BLOCKED donor never appears in
 * an app search at all (donorBaseWhere), so the field would be the constant "ACTIVE" and
 * inviting a client to branch on it would be inviting a bug.
 */
export function donorSearchView(profile, viewer) {
  const staff = isStaff(viewer);
  const distanceKm = profile.distanceKm ?? null;

  return {
    userId: profile.userId,
    name: profile.user.name,
    phone: profile.user.phone,
    bloodGroup: profile.bloodGroup,
    bloodGroupLabel: bloodGroupLabel(profile.bloodGroup),
    bloodGroupShort: bloodGroupShort(profile.bloodGroup),
    gender: profile.gender,
    isAvailable: profile.isAvailable,
    lastDonationDate: profile.lastDonationDate,
    profilePhotoUrl: profile.profilePhotoUrl,
    state: profile.state,
    district: profile.district,
    city: profile.city,
    distanceKm: staff ? distanceKm : coarseKm(distanceKm),
    // Says out loud that the number an app user sees is deliberately imprecise, so a client
    // renders "about 2.5 km away" rather than implying a survey-grade measurement.
    distanceIsApproximate: !staff && distanceKm !== null,
    ...(staff
      ? {
          address: profile.address,
          pincode: profile.pincode,
          latitude: profile.latitude,
          longitude: profile.longitude,
          status: profile.user.status,
        }
      : {}),
  };
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

function pageBounds({ page = 1, pageSize = env.search.defaultPageSize }) {
  const size = Math.min(Math.max(pageSize, 1), env.search.maxPageSize);
  const current = Math.max(page, 1);
  return { page: current, pageSize: size, skip: (current - 1) * size };
}

/**
 * Proximity search. Reads at most env.search.maxCandidateRows bounding-box survivors,
 * measures them exactly, drops the corners of the box, then pages the sorted list.
 *
 * `truncated` in the response is honest rather than decorative: if the box hit the row
 * cap, the result is the nearest page of a partial read, and the caller should narrow the
 * radius. It is surfaced to the client so the UI can say so instead of quietly lying
 * about "12 donors found".
 */
async function searchByProximity(where, params, viewer) {
  const { latitude, longitude, radiusKm } = params;
  const box = boundingBox(latitude, longitude, radiusKm);

  const rows = await prisma.donorProfile.findMany({
    where: withBoundingBox(where, box),
    select: DONOR_SELECT,
    take: env.search.maxCandidateRows,
  });

  const truncated = rows.length === env.search.maxCandidateRows;

  const ranked = withinRadius(rankByDistance(rows, { latitude, longitude }), radiusKm)
    // A donor inside the box but with a null coordinate cannot happen (the box predicate
    // excludes nulls), but rankByDistance tolerates them, so drop them explicitly rather
    // than let an unmeasurable row claim a slot in a distance-sorted list.
    .filter((row) => row.distanceKm !== null);

  const { page, pageSize, skip } = pageBounds(params);

  return {
    results: ranked.slice(skip, skip + pageSize).map((row) => donorSearchView(row, viewer)),
    page,
    pageSize,
    total: ranked.length,
    hasMore: skip + pageSize < ranked.length,
    radiusKm,
    mode: 'proximity',
    truncated,
  };
}

/** Administrative search. Postgres does the counting, sorting and paging. */
async function searchByArea(where, params, viewer) {
  const { page, pageSize, skip } = pageBounds(params);

  const [total, rows] = await prisma.$transaction([
    prisma.donorProfile.count({ where }),
    prisma.donorProfile.findMany({
      where,
      select: DONOR_SELECT,
      orderBy: [{ user: { name: 'asc' } }, { userId: 'asc' }],
      skip,
      take: pageSize,
    }),
  ]);

  return {
    results: rows.map((row) => donorSearchView(row, viewer)),
    page,
    pageSize,
    total,
    hasMore: skip + rows.length < total,
    radiusKm: null,
    mode: 'area',
    truncated: false,
  };
}

/**
 * The GET /donors/search entry point. `viewer` is the authenticated caller: it decides
 * how much of each donor comes back, and keeps the caller out of their own results.
 */
export async function searchDonors(params, viewer) {
  const where = donorBaseWhere({
    ...params,
    // Nobody needs to be told they themselves are nearby.
    excludeUserIds: viewer?.id ? [viewer.id] : [],
  });

  const useProximity = params.latitude !== undefined && params.longitude !== undefined;

  const result = useProximity
    ? await searchByProximity(where, { ...params, radiusKm: params.radiusKm ?? env.search.defaultRadiusKm }, viewer)
    : await searchByArea(where, params, viewer);

  return {
    ...result,
    filters: {
      bloodGroup: params.bloodGroup ?? null,
      compatible: Boolean(params.compatible),
      compatibleGroups: searchableDonorGroups(params.bloodGroup, { compatible: params.compatible }),
      state: params.state ?? null,
      district: params.district ?? null,
      city: params.city ?? null,
      availableOnly: params.availableOnly !== false,
    },
  };
}
