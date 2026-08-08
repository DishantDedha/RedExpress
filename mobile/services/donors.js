import { api } from './apiClient';

/**
 * Donor search — the "Find Blood Donors" screen (mockup 2).
 *
 * The backend takes every filter as a query parameter and validates them together
 * (`backend/src/validation/searchSchemas.js`). Two of its rules are easy to break from a
 * screen and produce a confusing 400, so they are enforced here where the reason is
 * visible:
 *
 *   - latitude and longitude go together or not at all. Half a position would silently
 *     turn a proximity search into a nationwide one.
 *   - a radius without a position means nothing, so it is dropped rather than sent.
 *
 * Everything else is passed through untouched; the server is the authority on what a valid
 * blood group or page size is.
 */

/**
 * Builds a query string, skipping anything the user has not filled in.
 *
 * Empty is not the same as absent to the backend: `state=` is a state filter matching the
 * empty string, while omitting the key means "any state". A screen that clears a dropdown
 * must produce the second, so blank values are dropped here rather than in each caller.
 */
function toQuery(params) {
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.append(key, typeof value === 'boolean' ? String(value) : String(value));
  }

  const query = search.toString();
  return query ? `?${query}` : '';
}

/**
 * @param {object} filters
 * @param {string} [filters.bloodGroup]      `O_NEG` — the enum, not "O-".
 * @param {boolean} [filters.compatible]     widen to every group that can donate to this one
 * @param {string} [filters.state]
 * @param {string} [filters.district]
 * @param {string} [filters.city]
 * @param {{latitude: number, longitude: number}} [filters.coords]
 * @param {number} [filters.radiusKm]        ignored unless `coords` is present
 * @param {boolean} [filters.availableOnly]  defaults to true server-side
 * @param {number} [filters.page]
 * @param {number} [filters.pageSize]
 *
 * @returns {Promise<{ results, page, pageSize, total, hasMore, radiusKm, mode, truncated,
 *                     filters, message }>}
 *          `message` is a full sentence the screen announces verbatim — "3 donors found." —
 *          because a list that quietly changes under a search button is silent to a screen
 *          reader. `truncated` is true when the search hit the server's row cap and the
 *          result is the nearest page of a partial read, which the UI must say rather than
 *          present as a complete answer.
 */
export function searchDonors(filters = {}) {
  const { coords, radiusKm, ...rest } = filters;
  const hasCoords = Number.isFinite(coords?.latitude) && Number.isFinite(coords?.longitude);

  return api.get(
    `/donors/search${toQuery({
      ...rest,
      ...(hasCoords ? { lat: coords.latitude, lng: coords.longitude, radiusKm } : {}),
    })}`,
  );
}

export { toQuery };
