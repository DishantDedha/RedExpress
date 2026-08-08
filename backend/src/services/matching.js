/**
 * Who can give blood to whom, and how far out to look for them.
 *
 * Pure functions only — the database-facing half lives in matchingEngine.js. Keeping the
 * rules here means the part of the system that decides whether a person is asked to
 * donate can be tested without a Postgres instance (tests/matching.test.js).
 */
import { haversineKm, hasCoordinates, roundKm } from './geo.js';

export const BLOOD_GROUPS = ['O_NEG', 'O_POS', 'A_NEG', 'A_POS', 'B_NEG', 'B_POS', 'AB_NEG', 'AB_POS'];

/** Enum value -> the label the mockups show and a screen reader can read aloud. */
const GROUP_LABELS = {
  A_POS: 'A positive',
  A_NEG: 'A negative',
  B_POS: 'B positive',
  B_NEG: 'B negative',
  O_POS: 'O positive',
  O_NEG: 'O negative',
  AB_POS: 'AB positive',
  AB_NEG: 'AB negative',
};

/** Short form for tight UI ("O+"). Never use this as notification text: a screen reader
 *  reads "O+" as "O plus" at best and skips the symbol at worst — use bloodGroupLabel. */
const GROUP_SHORT = {
  A_POS: 'A+',
  A_NEG: 'A-',
  B_POS: 'B+',
  B_NEG: 'B-',
  O_POS: 'O+',
  O_NEG: 'O-',
  AB_POS: 'AB+',
  AB_NEG: 'AB-',
};

export function bloodGroupLabel(group) {
  return GROUP_LABELS[group] ?? group;
}

export function bloodGroupShort(group) {
  return GROUP_SHORT[group] ?? group;
}

// ---------------------------------------------------------------------------
// Compatibility
// ---------------------------------------------------------------------------

/**
 * Antigens carried by each group. The compatibility table is derived from these rather
 * than typed out, because a hand-written 8x8 table is one typo away from telling a
 * patient that O+ blood is safe for an O- recipient.
 */
function antigens(group) {
  const [abo, rh] = group.split('_');
  return {
    a: abo === 'A' || abo === 'AB',
    b: abo === 'B' || abo === 'AB',
    rh: rh === 'POS',
  };
}

/**
 * Whether a donor of `donorGroup` can give red cells to a patient of `recipientGroup`.
 *
 * The rule is one line: every antigen the donor carries must also be present in the
 * recipient, otherwise the recipient's immune system attacks the transfusion. Which is
 * why O- (no antigens at all) gives to everyone and AB+ (all of them) receives from
 * everyone.
 */
export function canDonate(donorGroup, recipientGroup) {
  if (!BLOOD_GROUPS.includes(donorGroup) || !BLOOD_GROUPS.includes(recipientGroup)) return false;
  const donor = antigens(donorGroup);
  const recipient = antigens(recipientGroup);
  return (!donor.a || recipient.a) && (!donor.b || recipient.b) && (!donor.rh || recipient.rh);
}

/** Every group that can donate to `recipientGroup`. This is the one used by search. */
export function donorGroupsFor(recipientGroup) {
  return BLOOD_GROUPS.filter((group) => canDonate(group, recipientGroup));
}

/** Every group a donor of `donorGroup` can help — "your blood can save …" copy. */
export function recipientGroupsFor(donorGroup) {
  return BLOOD_GROUPS.filter((group) => canDonate(donorGroup, group));
}

/** Precomputed recipient -> acceptable donor groups, for callers that want the whole map. */
export const COMPATIBILITY = Object.freeze(
  Object.fromEntries(BLOOD_GROUPS.map((group) => [group, Object.freeze(donorGroupsFor(group))])),
);

/**
 * The set of donor groups a search should look for.
 *
 * `compatible: false` (the default) means an exact group match, which is what a hospital
 * asking for "two units of B+" usually wants. `compatible: true` widens it to everyone
 * medically able to give — the right behaviour for a CRITICAL request.
 */
export function searchableDonorGroups(requestedGroup, { compatible = false } = {}) {
  if (!requestedGroup) return null;
  return compatible ? donorGroupsFor(requestedGroup) : [requestedGroup];
}

// ---------------------------------------------------------------------------
// Distance ranking
// ---------------------------------------------------------------------------

/**
 * Measures each candidate against `origin` and returns them nearest-first.
 *
 * Candidates with no usable coordinates keep distanceKm = null and sort last: they are
 * still real donors (an area match), just unrankable. Sorting them to the end rather
 * than dropping them is deliberate — for a district with poor GPS uptake they may be
 * everyone there is.
 */
export function rankByDistance(candidates, origin, { round = true } = {}) {
  const originUsable = hasCoordinates(origin);

  return candidates
    .map((candidate) => {
      const raw =
        originUsable && hasCoordinates(candidate)
          ? haversineKm(origin.latitude, origin.longitude, candidate.latitude, candidate.longitude)
          : NaN;
      const distanceKm = Number.isFinite(raw) ? (round ? roundKm(raw) : raw) : null;
      return { ...candidate, distanceKm };
    })
    .sort((a, b) => {
      if (a.distanceKm === null && b.distanceKm === null) return 0;
      if (a.distanceKm === null) return 1;
      if (b.distanceKm === null) return -1;
      return a.distanceKm - b.distanceKm;
    });
}

/** Drops anything measurably beyond the radius. Unmeasurable candidates are kept. */
export function withinRadius(ranked, radiusKm) {
  return ranked.filter((candidate) => candidate.distanceKm === null || candidate.distanceKm <= radiusKm);
}

// ---------------------------------------------------------------------------
// Radius expansion
// ---------------------------------------------------------------------------

export const DEFAULT_RADII_KM = [5, 10, 25, 50];

/**
 * Walks outwards until enough donors are found.
 *
 * `search(radiusKm)` is injected — the engine passes a Postgres query, tests pass a
 * fake — so the escalation policy itself carries no I/O and no mocking framework.
 *
 * Behaviour worth knowing:
 *  - it stops at the FIRST radius that reaches `minCandidates`, so a dense city notifies
 *    5 km of neighbours rather than everyone within 50;
 *  - if no radius reaches the minimum it returns the widest result it got, because some
 *    donors an hour away beat none at all;
 *  - each step is a fresh search over the whole circle, not a ring. Simpler, and the
 *    bounding-box query is cheap enough that re-reading the inner circle does not matter.
 *
 * Returns { radiusKm, candidates, steps, reachedMinimum } — `steps` is what the API
 * echoes back so staff can see the request only had to reach 10 km.
 */
export async function expandingRadiusSearch({
  radii = DEFAULT_RADII_KM,
  minCandidates = 20,
  search,
}) {
  if (typeof search !== 'function') {
    throw new TypeError('expandingRadiusSearch requires a search(radiusKm) function');
  }

  const ordered = [...radii].sort((a, b) => a - b);
  const steps = [];
  let best = { radiusKm: ordered[0] ?? 0, candidates: [] };

  for (const radiusKm of ordered) {
    const candidates = await search(radiusKm);
    steps.push({ radiusKm, found: candidates.length });

    // Never step back: a wider circle contains the narrower one, so more is always
    // at least as good, and this holds even if `search` is non-monotonic.
    if (candidates.length >= best.candidates.length) {
      best = { radiusKm, candidates };
    }

    if (candidates.length >= minCandidates) {
      return { radiusKm, candidates, steps, reachedMinimum: true };
    }
  }

  return { ...best, steps, reachedMinimum: false };
}
