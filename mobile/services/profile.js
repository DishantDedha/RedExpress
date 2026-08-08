import { api, request } from './apiClient';
import { getAccessToken, getCachedUser, getRefreshToken, saveSession } from './tokenStorage';

/**
 * Registration and profile calls.
 *
 * Every endpoint here returns the same envelope — `{ user, donorProfile, ... }` — so the
 * screens have one shape to read (`backend/src/services/profileService.js`, `profilePayload`).
 *
 * The cached user in secure storage is refreshed on every write. It is what decides which
 * stack the app opens on a cold start, and leaving it stale after registration would send a
 * freshly registered donor back to the form they just completed.
 */

async function cacheUser(user) {
  if (!user) return;
  // The tokens are re-read and written back untouched: `saveSession` writes all three keys
  // together, so passing only the user would clear the session it is meant to annotate.
  const [accessToken, refreshToken] = await Promise.all([getAccessToken(), getRefreshToken()]);
  await saveSession({ accessToken, refreshToken, user });
}

/**
 * Donor registration — the big form (mockups 6 and 11).
 *
 * Sent as multipart, always, whether or not a photo is attached: the backend runs the same
 * `optionalUpload` middleware either way, and one code path is easier to reason about than a
 * JSON branch and a multipart branch that must be kept in step.
 *
 * `fetch` sets the multipart boundary itself — `apiClient` deliberately does not set
 * Content-Type on a FormData body, because doing so produces a request the server cannot
 * parse.
 */
export async function registerDonor(values, photo) {
  const form = new FormData();

  const fields = {
    fullName: values.fullName,
    email: values.email,
    phone: values.phone,
    bloodGroup: values.bloodGroup,
    gender: values.gender,
    dateOfBirth: values.dateOfBirth,
    state: values.state,
    district: values.district,
    city: values.city,
    pincode: values.pincode,
    address: values.address,
    latitude: values.latitude,
    longitude: values.longitude,
    password: values.password,
    confirmPassword: values.confirmPassword,
  };

  for (const [key, value] of Object.entries(fields)) {
    // Absent is not the same as empty. The backend's `optionalText` treats "" as "not
    // provided", but latitude and longitude must be sent together or not at all, so an
    // empty string for one of them would be a validation error rather than an omission.
    if (value === undefined || value === null || value === '') continue;
    form.append(key, String(value));
  }

  if (photo) {
    // React Native's FormData takes this triple rather than a Blob.
    form.append('profilePhoto', {
      uri: photo.uri,
      name: photo.name,
      type: photo.mimeType,
    });
  }

  const result = await request('/donors/register', { method: 'POST', body: form });
  await cacheUser(result.user);
  return result;
}

/** The quick receiver form (mockup 7). No file, so plain JSON. */
export async function registerReceiver(values) {
  const body = {};
  for (const key of ['fullName', 'state', 'district', 'city', 'email', 'phone', 'latitude', 'longitude']) {
    const value = values[key];
    if (value === undefined || value === null || value === '') continue;
    body[key] = value;
  }

  const result = await api.post('/receivers/register', body);
  await cacheUser(result.user);
  return result;
}

/** The signed-in donor's own profile. 404s with `PROFILE_NOT_FOUND` if they never registered. */
export function getDonorProfile() {
  return api.get('/donors/me');
}

/** Whoever is signed in, whatever their role — the app's "who am I" call. */
export function getMe() {
  return api.get('/me');
}

/**
 * Partial profile update. Sent as multipart for the same reason as registration: a photo may
 * be part of it, and the backend accepts either.
 */
export async function updateDonorProfile(changes, photo) {
  const form = new FormData();

  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    // `removePhoto=true` deletes the current photo without uploading a replacement.
    form.append(key, value === null ? '' : String(value));
  }

  if (photo) {
    form.append('profilePhoto', { uri: photo.uri, name: photo.name, type: photo.mimeType });
  }

  const result = await request('/donors/me', { method: 'PATCH', body: form });
  await cacheUser(result.user);
  return result;
}

/**
 * The availability toggle.
 *
 * The response carries a `message` written as a full sentence — "You are now shown as
 * available to donate." — which the profile screen announces verbatim. The consequence is
 * what matters to the user, not the boolean.
 */
export function setAvailability(isAvailable) {
  return api.patch('/donors/me/availability', { isAvailable });
}

/** `date` is `YYYY-MM-DD`, or null to clear it — "I have never donated" is a real answer. */
export function setLastDonationDate(date) {
  return api.patch('/donors/me/last-donation', { date });
}

/** The last-known user without a network call, for deciding what to render first. */
export function getCachedProfileUser() {
  return getCachedUser();
}
