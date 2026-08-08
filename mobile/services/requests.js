import { api } from './apiClient';
import { toQuery } from './donors';

/**
 * Blood requests: post one, read one, answer one.
 *
 * Posting a request is the only call in the app that makes other people's phones buzz. The
 * backend runs the matching engine inline and answers with who was found and who was told
 * (`backend/src/services/requestService.js`), so the screen never has to poll to find out
 * whether anything happened.
 */

/**
 * Posts a request and, server-side, notifies the donors it matches.
 *
 * @returns {Promise<{ request, matching, donors, locationSource, message }>}
 *          `message` is the sentence to announce — "Request posted. 12 nearby donors are
 *          being notified." — and `donors` is the matched list, so the requester can start
 *          calling immediately instead of waiting for anyone to answer a push.
 */
export function createRequest(values) {
  const body = {};

  for (const [key, value] of Object.entries(values)) {
    // The backend treats "" as "not provided" for text, but latitude and longitude must be
    // sent together or not at all — an empty string for one of them is a validation error
    // rather than an omission. Dropping blanks here keeps that from ever arising.
    if (value === undefined || value === null || value === '') continue;
    body[key] = value;
  }

  return api.post('/requests', body);
}

/**
 * @param {'mine'|'matched'} [params.scope] `mine` = requests I posted, `matched` = requests
 *        I was asked to help with. There is deliberately no "browse everything" for app
 *        users: an open board of who is in hospital is a different, worse product.
 */
export function listRequests(params = {}) {
  return api.get(`/requests${toQuery(params)}`);
}

/**
 * One request.
 *
 * @returns {Promise<{ request, canRespond, canUpdateStatus }>}
 *          `canRespond` is the server's answer to "should this screen show Accept and
 *          Decline" — it is false for a request that has been closed, has expired, or was
 *          never sent to this donor. The screen asks rather than working it out from
 *          timestamps, so a request that expired while the notification sat in the tray
 *          cannot be answered by a stale client.
 *
 *          403 `FORBIDDEN` means the request exists but was not sent to you.
 */
export function getRequest(id) {
  return api.get(`/requests/${encodeURIComponent(id)}`);
}

/**
 * A donor's answer to "can you help?".
 *
 * Accepting unlocks the hospital details in the response — contact information is earned by
 * saying yes rather than shown up front — and pushes a notification to the requester.
 * Changing an earlier answer is allowed: a donor who quietly cannot come is worse than one
 * who says so.
 */
export function respondToMatch({ requestId, donorUserId, response }) {
  return api.post(
    `/requests/${encodeURIComponent(requestId)}/matches/${encodeURIComponent(donorUserId)}/respond`,
    { response },
  );
}

/** Closes a request. Only its author or staff may call this. */
export function updateRequestStatus(id, status, note) {
  return api.patch(`/requests/${encodeURIComponent(id)}/status`, { status, ...(note ? { note } : {}) });
}

/** The donors who were notified. The requester sees their own; staff see any. */
export function listMatches(id) {
  return api.get(`/requests/${encodeURIComponent(id)}/matches`);
}

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

/**
 * Urgency as words rather than a colour.
 *
 * The obvious design is a red/amber/grey chip. To a blind donor that chip does not exist,
 * and to anyone with a colour vision deficiency red and amber are the same chip — so the
 * level is always written out, and the colour is a supplement (WCAG 1.4.1).
 */
export const URGENCY_OPTIONS = [
  { value: 'NORMAL', label: 'Normal', description: 'Needed in the next day or so' },
  { value: 'URGENT', label: 'Urgent', description: 'Needed within hours' },
  { value: 'CRITICAL', label: 'Critical', description: 'Needed immediately' },
];

export function urgencyLabel(value) {
  return URGENCY_OPTIONS.find((option) => option.value === value)?.label ?? 'Normal';
}

/**
 * A distance as a phrase, matching the wording of the push notification the donor already
 * heard (`backend/src/services/pushMessages.js`). Hearing "about 3.2 kilometres away" in the
 * notification and then reading "3.2 km" on the screen is a small but real seam.
 *
 * Returns null when there is no measurement — a donor matched by district has no honest
 * number, and "0 kilometres" would send someone across the state.
 */
export function distancePhrase(distanceKm) {
  if (distanceKm === null || distanceKm === undefined || !Number.isFinite(distanceKm)) return null;
  if (distanceKm < 1) return 'less than a kilometre away';

  const rounded = distanceKm < 10 ? Math.round(distanceKm * 10) / 10 : Math.round(distanceKm);
  return `about ${rounded} ${rounded === 1 ? 'kilometre' : 'kilometres'} away`;
}

/** "in 4 hours" / "in 20 minutes" / "expired" — an absolute timestamp is not actionable. */
export function expiryPhrase(expiresAt) {
  if (!expiresAt) return null;

  const ms = new Date(expiresAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return null;
  if (ms <= 0) return 'This request has expired.';

  const minutes = Math.round(ms / 60_000);
  if (minutes < 60) return `Closes in about ${minutes} ${minutes === 1 ? 'minute' : 'minutes'}.`;

  const hours = Math.round(minutes / 60);
  return `Closes in about ${hours} ${hours === 1 ? 'hour' : 'hours'}.`;
}
