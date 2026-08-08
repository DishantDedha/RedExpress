import { geocodeAddress, geocodingEnabled } from './geocodingService.js';

/**
 * One rule for "where is this?", shared by donor registration, receiver registration and
 * blood requests, so all three degrade the same way.
 *
 * Coordinates come from the device when the user granted the location permission, and
 * from geocoding the typed address when they did not. Neither is fatal: a record with no
 * coordinates is matched by state/district/city instead.
 *
 * `locationSource` is returned so the client can say what actually happened ("Using your
 * current location" vs "Using your typed address") — which is the only cue a blind user
 * gets that the GPS permission mattered.
 */
export async function resolveCoordinates({ latitude, longitude, address, city, district, state, pincode }) {
  if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
    return { latitude, longitude, locationSource: 'device' };
  }

  if (!geocodingEnabled) {
    return { latitude: null, longitude: null, locationSource: 'none' };
  }

  const geocoded = await geocodeAddress({ address, city, district, state, pincode });
  if (!geocoded) {
    return { latitude: null, longitude: null, locationSource: 'none' };
  }

  return { latitude: geocoded.latitude, longitude: geocoded.longitude, locationSource: geocoded.provider };
}
