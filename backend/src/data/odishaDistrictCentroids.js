/**
 * Approximate centre point of each Odisha district — the headquarters town's coordinates,
 * taken from public sources (Wikipedia district infoboxes).
 *
 * ## What this is for
 *
 * `donorSearchService.searchDonors` uses this to turn "district: Puri" into a point it can
 * measure distance from, when the searcher typed an address instead of sharing GPS. It is
 * not meant to be precise — a district can be over a hundred kilometres across — only good
 * enough to rank "which donors are roughly nearby" instead of doing an exact-match query
 * that returns nothing the moment nobody happens to live in the exact city typed in.
 *
 * ## Why not `geocodingService.geocodeAddress`
 *
 * That calls Nominatim over the network, which is rate-limited and meant for one-off
 * lookups at registration time, not a call on every search keystroke. Thirty districts is a
 * short, fixed list — worth hardcoding once rather than hitting a rate-limited API on a path
 * that needs to answer fast.
 *
 * Keyed to match `mobile/data/locations.js` exactly. If a district is ever added there, add
 * it here too, or a receiver in that district simply falls back to the old exact-match
 * search (see `centroidForDistrict` below) rather than getting an error.
 */
const CENTROIDS = {
  Angul: { latitude: 20.838, longitude: 85.096 },
  Balangir: { latitude: 20.72, longitude: 83.48 },
  Balasore: { latitude: 21.4942, longitude: 86.9317 },
  Bargarh: { latitude: 21.333, longitude: 83.617 },
  Bhadrak: { latitude: 21.06, longitude: 86.5 },
  Boudh: { latitude: 20.84, longitude: 84.32 },
  Cuttack: { latitude: 20.466, longitude: 85.833 },
  Deogarh: { latitude: 21.53, longitude: 84.73 },
  Dhenkanal: { latitude: 20.65, longitude: 85.6 },
  Gajapati: { latitude: 18.8, longitude: 84.2 },
  Ganjam: { latitude: 19.383, longitude: 85.05 },
  Jagatsinghpur: { latitude: 20.27, longitude: 86.17 },
  Jajpur: { latitude: 20.85, longitude: 86.33 },
  Jharsuguda: { latitude: 21.85, longitude: 84.016 },
  Kalahandi: { latitude: 20.083, longitude: 83.2 },
  Kandhamal: { latitude: 20.47, longitude: 84.23 },
  Kendrapara: { latitude: 20.525, longitude: 86.475 },
  Kendujhar: { latitude: 21.633, longitude: 85.6 },
  Khordha: { latitude: 20.166, longitude: 85.666 },
  Koraput: { latitude: 18.808, longitude: 82.708 },
  Malkangiri: { latitude: 18.35, longitude: 81.9 },
  Mayurbhanj: { latitude: 21.933, longitude: 86.733 },
  Nabarangpur: { latitude: 19.23, longitude: 82.55 },
  Nayagarh: { latitude: 20.116, longitude: 85.01 },
  Nuapada: { latitude: 20.8167, longitude: 82.5333 },
  Puri: { latitude: 19.816, longitude: 85.833 },
  Rayagada: { latitude: 19.166, longitude: 83.416 },
  Sambalpur: { latitude: 21.466, longitude: 83.983 },
  Subarnapur: { latitude: 20.85, longitude: 83.9 },
  Sundargarh: { latitude: 22.116, longitude: 84.016 },
};

/** Case-insensitive, so "puri", "Puri" and "PURI" from three different clients all resolve. */
export function centroidForDistrict(district) {
  if (!district) return null;
  const key = Object.keys(CENTROIDS).find((name) => name.toLowerCase() === district.trim().toLowerCase());
  return key ? CENTROIDS[key] : null;
}
