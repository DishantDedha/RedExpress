import { api } from './apiClient';
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
 * Plain JSON, no file. `optionalUpload` on the backend passes a JSON body through untouched,
 * so this was always a supported shape, not a workaround bolted on.
 *
 * ## Why there is no photo parameter
 *
 * There was one, sent as multipart with `form.append('profilePhoto', { uri, name, type })` —
 * the shape React Native's own FormData docs prescribe. In practice, on this project's React
 * Native version with the New Architecture on, the native layer rejects that exact object
 * with `Error: Unsupported FormDataPart implementation`, thrown before the request leaves the
 * device — every registration that reached this code path failed outright, with no server
 * involved and nothing a retry could fix.
 *
 * Chasing the native incompatibility was not worth it tonight, because the destination has
 * the same problem from the other side: Render's free web service has no persistent disk, and
 * `STORAGE_DRIVER=local` writes to it, so any photo that did upload would be deleted on the
 * next deploy anyway. Both ends of this feature need work — a dev/production build to get a
 * working native FormData implementation, and S3 storage so an upload survives a redeploy —
 * before it is worth turning back on. `components/PhotoPicker.js` is unchanged and ready for
 * that day; only the two screens that called it were adjusted.
 */
export async function registerDonor(values) {
  const body = {};

  for (const key of [
    'fullName',
    'email',
    'phone',
    'bloodGroup',
    'gender',
    'dateOfBirth',
    'weight',
    'emergencyContact',
    'state',
    'district',
    'city',
    'pincode',
    'address',
    'latitude',
    'longitude',
    'password',
    'confirmPassword',
  ]) {
    const value = values[key];
    // Absent is not the same as empty. The backend's `optionalText` treats "" as "not
    // provided", but latitude and longitude must be sent together or not at all, so an
    // empty string for one of them would be a validation error rather than an omission.
    if (value === undefined || value === null || value === '') continue;
    body[key] = value;
  }

  const result = await api.post('/donors/register', body);
  await cacheUser(result.user);
  return result;
}

/**
 * The quick receiver form (mockup 7). No file, so plain JSON.
 *
 * The key list is an allow-list, so a field missing from it is dropped silently — which is
 * exactly what happened to `password` and `confirmPassword` when the receiver flow gained a
 * sign-in credential and this list was not updated alongside `registerDonor`'s. The form
 * collected both, this function discarded them, and `receiverRegisterSchema` rejected the
 * request with "Enter a password." about a field the user had visibly filled in.
 */
export async function registerReceiver(values) {
  const body = {};
  for (const key of [
    'fullName',
    'state',
    'district',
    'city',
    'email',
    'phone',
    'latitude',
    'longitude',
    'password',
    'confirmPassword',
  ]) {
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
 * Partial profile update. Plain JSON, no file — see the note on `registerDonor` for why photo
 * upload is off for now.
 */
export async function updateDonorProfile(changes) {
  const body = {};
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    body[key] = value;
  }

  const result = await api.patch('/donors/me', body);
  await cacheUser(result.user);
  return result;
}

/**
 * The availability selector — one of the four AvailabilityStatus values.
 *
 * The response carries a `message` written as a full sentence — "You are now shown as
 * available to donate." — which the profile screen announces verbatim. The consequence is
 * what matters to the user, not the enum value.
 */
export function setAvailabilityStatus(availabilityStatus) {
  return api.patch('/donors/me/availability', { availabilityStatus });
}

/** `date` is `YYYY-MM-DD`, or null to clear it — "I have never donated" is a real answer. */
export function setLastDonationDate(date) {
  return api.patch('/donors/me/last-donation', { date });
}

/** The last-known user without a network call, for deciding what to render first. */
export function getCachedProfileUser() {
  return getCachedUser();
}
