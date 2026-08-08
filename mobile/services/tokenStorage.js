import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * Where the access and refresh tokens live.
 *
 * `expo-secure-store` only — Keychain on iOS, the Android Keystore-backed EncryptedSharedPreferences
 * on Android. Never AsyncStorage: that is a plain unencrypted file, and a refresh token is
 * good for 30 days against an API that returns donors' phone numbers and home addresses.
 * Phase 15 revisits this, but the rule is set here so nothing is written the wrong way first.
 *
 * On web, SecureStore does not exist. Rather than silently falling back to localStorage —
 * which would be a real security regression dressed up as compatibility — the web build
 * keeps tokens in memory only, so a refresh signs the user out. Web is a development
 * convenience for this app; the shipped targets are iOS and Android.
 */

const ACCESS_KEY = 'redexpress.accessToken';
const REFRESH_KEY = 'redexpress.refreshToken';
const USER_KEY = 'redexpress.user';
const PUSH_KEY = 'redexpress.expoPushToken';

const isWeb = Platform.OS === 'web';
const memory = new Map();

async function put(key, value) {
  if (isWeb) {
    if (value == null) memory.delete(key);
    else memory.set(key, value);
    return;
  }
  if (value == null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}

async function take(key) {
  if (isWeb) return memory.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

export async function saveSession({ accessToken, refreshToken, user }) {
  await Promise.all([
    put(ACCESS_KEY, accessToken ?? null),
    put(REFRESH_KEY, refreshToken ?? null),
    // Cached so the app can decide which stack to show on cold start without waiting on a
    // network round-trip. It is a hint, not an authority — the server re-checks every call.
    put(USER_KEY, user ? JSON.stringify(user) : null),
  ]);
}

export async function getAccessToken() {
  return take(ACCESS_KEY);
}

export async function getRefreshToken() {
  return take(REFRESH_KEY);
}

export async function getCachedUser() {
  const raw = await take(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // Corrupted or written by an older build. Treat as signed out rather than crashing on
    // launch, which would be unrecoverable without reinstalling.
    return null;
  }
}

/** Wipes everything. Called on logout and on a forced sign-out. */
export async function clearSession() {
  await Promise.all([put(ACCESS_KEY, null), put(REFRESH_KEY, null), put(USER_KEY, null)]);
}

// ---------------------------------------------------------------------------
// The Expo push token
// ---------------------------------------------------------------------------
//
// Not part of the session — it identifies the *installation*, not the person, and it
// deliberately survives `clearSession`. Two reasons:
//
//   1. Sign-out has to tell the backend to forget this device (`DELETE /devices/:token`),
//      and the call needs the token that was registered. Reading it back from
//      `expo-notifications` at that moment would fail on a phone where the user has since
//      revoked notification permission — exactly the case where dropping the registration
//      matters most.
//   2. Minting a token is a network round-trip to Expo. Caching it lets the app skip that
//      when nothing has changed.
//
// It is not a secret, but it lives here rather than in a second storage module because
// this is the file that already knows how to write on both native and web.

export async function savePushToken(token) {
  await put(PUSH_KEY, token ?? null);
}

export async function getPushToken() {
  return take(PUSH_KEY);
}
