/**
 * The words a donor actually hears.
 *
 * Pure functions only — no Prisma, no network — so the copy can be unit-tested
 * (tests/notifications.test.js) and reviewed as text rather than inferred from a
 * template buried in a service.
 *
 * Every string here is written for a screen reader first, because a blind donor is the
 * primary user of this app and a push notification is often the first thing they hear:
 *
 *   - No emoji. TalkBack reads "🩸" as "drop of blood" mid-sentence, or skips it; either
 *     way an emoji must never be the only carrier of meaning.
 *   - No ALL CAPS. "URGENT" is spelled out letter by letter by several screen readers.
 *     "Urgent" is read as a word.
 *   - No abbreviations that depend on being seen. "km" and "O+" are unreliable when
 *     spoken, so distances say "kilometres" and groups use bloodGroupLabel
 *     ("O negative"), never bloodGroupShort ("O-").
 *   - Front-loaded. Android truncates the body in the shade and a screen reader may be
 *     interrupted, so the blood group and the urgency come first and the pleasantries
 *     do not exist.
 */
import { bloodGroupLabel } from './matching.js';

/** data.type values. The mobile app switches on these to pick a deep-link target. */
export const NOTIFICATION_TYPES = Object.freeze({
  REQUEST_MATCH: 'BLOOD_REQUEST_MATCH',
  REQUEST_ACCEPTED: 'BLOOD_REQUEST_ACCEPTED',
});

/** Leading word by urgency. NORMAL gets none — if everything is urgent, nothing is. */
const URGENCY_PREFIX = {
  CRITICAL: 'Critical',
  URGENT: 'Urgent',
  NORMAL: null,
};

/**
 * Expo priority. A CRITICAL request should wake a dozing phone; a NORMAL one can wait for
 * the next maintenance window and save the donor's battery.
 */
export function pushPriority(urgency) {
  return urgency === 'CRITICAL' || urgency === 'URGENT' ? 'high' : 'default';
}

/**
 * Distance as a spoken phrase.
 *
 * Returns null when the donor was matched by district rather than by coordinates — there
 * is no honest number, and inventing "0 kilometres away" would send someone across the
 * state believing they were around the corner.
 */
export function distancePhrase(distanceKm) {
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 1) return 'less than a kilometre away';

  // One decimal below 10 km (the difference between 2.3 and 2.8 km is a different bus),
  // whole numbers above it (nobody acts on 41.7 versus 42).
  const rounded = distanceKm < 10 ? Math.round(distanceKm * 10) / 10 : Math.round(distanceKm);
  const unit = rounded === 1 ? 'kilometre' : 'kilometres';
  return `about ${rounded} ${unit} away`;
}

/** "Apollo Hospital, Bhubaneswar" — whichever parts exist, in the order a person says them. */
function placePhrase(request) {
  return [request.hospitalName, request.city || request.district].filter(Boolean).join(', ');
}

function unitsPhrase(unitsNeeded) {
  if (!Number.isFinite(unitsNeeded) || unitsNeeded < 1) return null;
  return `${unitsNeeded} ${unitsNeeded === 1 ? 'unit' : 'units'} needed`;
}

/**
 * The notification a matched donor receives.
 *
 * Title  "Urgent: O negative blood needed nearby"
 * Body   "Apollo Hospital, Bhubaneswar, about 3.2 kilometres away. 2 units needed."
 *
 * `data` carries the ids the app needs to open the respond screen straight from the
 * notification tray, so the donor never has to hunt for the request in a list.
 */
export function buildMatchNotification({ request, distanceKm = null, matchId = null }) {
  const group = bloodGroupLabel(request.bloodGroup);
  const prefix = URGENCY_PREFIX[request.urgency] ?? null;

  const title = prefix
    ? `${prefix}: ${group} blood needed nearby`
    : `${group} blood needed nearby`;

  // Sentences rather than a bullet list: a screen reader pauses at a full stop, which is
  // the only punctuation that reliably gives the listener a beat to take it in.
  const body = [
    [placePhrase(request), distancePhrase(distanceKm)].filter(Boolean).join(', '),
    unitsPhrase(request.unitsNeeded),
  ]
    .filter(Boolean)
    .map((sentence) => (sentence.endsWith('.') ? sentence : `${sentence}.`))
    .join(' ');

  return {
    type: NOTIFICATION_TYPES.REQUEST_MATCH,
    title,
    body,
    data: {
      type: NOTIFICATION_TYPES.REQUEST_MATCH,
      requestId: request.id,
      matchId,
      bloodGroup: request.bloodGroup,
      urgency: request.urgency,
      distanceKm,
      // Where the app should navigate. Sending a route rather than letting the client
      // reconstruct one keeps the deep link fixable from the server.
      screen: 'request-detail',
    },
    priority: pushPriority(request.urgency),
  };
}

/**
 * Told to the requester when a donor accepts. The donor's name is included because the
 * requester is about to ring them, and "someone accepted" is not actionable.
 */
export function buildAcceptedNotification({ request, donorName, distanceKm = null }) {
  const distance = distancePhrase(distanceKm);

  return {
    type: NOTIFICATION_TYPES.REQUEST_ACCEPTED,
    title: `${donorName} can donate`,
    body: [
      `${donorName} accepted your ${bloodGroupLabel(request.bloodGroup)} blood request`,
      distance ? ` and is ${distance}` : '',
      '. Open the request to see their number.',
    ].join(''),
    data: {
      type: NOTIFICATION_TYPES.REQUEST_ACCEPTED,
      requestId: request.id,
      screen: 'request-detail',
    },
    priority: 'high',
  };
}
