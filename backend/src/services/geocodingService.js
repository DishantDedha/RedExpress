import { env } from '../config/env.js';

/**
 * Address -> coordinates, for donors who decline the GPS permission.
 *
 * Never throws and never blocks registration: a donor without coordinates is still
 * matched by state/district/city (see the administrative-area fallback in Phase 4's
 * matching engine), so a geocoder outage degrades match quality rather than turning
 * people away at signup. Every failure path returns null.
 *
 * GEOCODER_PROVIDER selects the implementation:
 *   none       (default) — disabled; the client must supply lat/lng.
 *   nominatim  — OpenStreetMap. Free, no key, but rate-limited to ~1 req/s and its
 *                usage policy forbids heavy use; fine for development and low volume.
 *   google     — Google Geocoding API, needs GEOCODER_API_KEY.
 */

/** Builds a single-line query from the parts of the registration form. */
function formatAddress({ address, city, district, state, pincode, country }) {
  return [address, city, district, state, pincode, country ?? env.geocoder.defaultCountry]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(', ');
}

async function fetchJson(url, headers) {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(env.geocoder.timeoutMs),
  });
  if (!res.ok) throw new Error(`geocoder responded ${res.status}`);
  return res.json();
}

async function geocodeWithNominatim(query) {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('limit', '1');

  const results = await fetchJson(url, { 'User-Agent': env.geocoder.userAgent, 'Accept-Language': 'en' });
  const hit = Array.isArray(results) ? results[0] : null;
  if (!hit) return null;

  return {
    latitude: Number(hit.lat),
    longitude: Number(hit.lon),
    provider: 'nominatim',
    // Nominatim's "type" is its own taxonomy (house, road, city…). Passed through as a
    // rough quality signal rather than normalised.
    precision: hit.type ?? null,
  };
}

async function geocodeWithGoogle(query) {
  if (!env.geocoder.apiKey) throw new Error('GEOCODER_API_KEY is not set');

  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', env.geocoder.apiKey);

  const body = await fetchJson(url);
  if (body.status === 'ZERO_RESULTS') return null;
  if (body.status !== 'OK') throw new Error(`geocoder status ${body.status}`);

  const hit = body.results[0];
  return {
    latitude: hit.geometry.location.lat,
    longitude: hit.geometry.location.lng,
    provider: 'google',
    precision: hit.geometry.location_type ?? null,
  };
}

const PROVIDERS = {
  nominatim: geocodeWithNominatim,
  google: geocodeWithGoogle,
};

export const geocodingEnabled = env.geocoder.provider !== 'none';

/**
 * Resolves { address, city, district, state, pincode } to
 * { latitude, longitude, provider, precision } — or null if it could not be resolved.
 */
export async function geocodeAddress(parts) {
  const geocode = PROVIDERS[env.geocoder.provider];
  if (!geocode) return null;

  const query = formatAddress(parts);
  // A bare country name would happily geocode to the centroid of India. Anything shorter
  // than a district plus one more component is not worth a lookup.
  if (query.length < 8) return null;

  try {
    const result = await geocode(query);
    if (!result || !Number.isFinite(result.latitude) || !Number.isFinite(result.longitude)) return null;
    return result;
  } catch (err) {
    console.warn(`[geocoder:${env.geocoder.provider}] lookup failed:`, err.message);
    return null;
  }
}
