import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The accessibility preferences a user sets for themselves, and where they are remembered.
 *
 * These are not cosmetic settings. A donor who needs bigger text or a second voice reading
 * the screen needs it on the login screen of a cold start, not after they have found the
 * settings page again — so they are persisted, hydrated before the first paint where
 * possible, and readable synchronously from anywhere in the app.
 *
 * ## Why a hand-rolled store rather than context
 *
 * `AppText` reads the text scale, and `AppText` is *every* piece of text in the app,
 * including the ones inside modals rendered outside the screen tree. A React context would
 * work, but every provider boundary is a place the value can fail to reach, and a missed one
 * shows up as a single un-scaled label that nobody notices at default size.
 *
 * A module-level store with `useSyncExternalStore` has no boundary to miss: any component
 * that calls the hook is subscribed, wherever it is mounted. The snapshot is a frozen object
 * replaced wholesale on change, so the identity check `useSyncExternalStore` performs is
 * correct without any memoisation.
 *
 * ## Storage
 *
 * `expo-secure-store` on device — not because preferences are secret, but because it is the
 * one key-value store this app already depends on, and adding AsyncStorage for four booleans
 * is a dependency nobody should have to audit. On web, `localStorage`: these are not
 * credentials (unlike the tokens in `tokenStorage.js`, which deliberately stay in memory
 * there), so ordinary browser persistence is the right answer.
 *
 * A read or write failure is never fatal. The worst case is that a preference does not stick
 * across restarts, and an app that crashes on launch because a settings file is corrupt is a
 * far worse accessibility outcome than one that opens at default size.
 */

const KEY = 'redexpress.accessibilityPreferences';
const isWeb = Platform.OS === 'web';

/**
 * `voiceGuidance`  Read the screen's purpose and confirmations aloud with expo-speech.
 *                  Off by default: turning a second voice on for someone who did not ask for
 *                  it, on top of a screen reader they are already listening to, is worse than
 *                  not offering it.
 *
 * `bigText`        Multiply every font size by `a11y.bigTextScale`, on top of whatever the OS
 *                  text-size setting already does. It exists because the OS setting is buried
 *                  several screens deep in system settings and a user who needs it may not be
 *                  able to read their way there.
 *
 * `highContrast`   Drop the muted greys, darken the fills, thicken the borders. For reduced
 *                  contrast sensitivity and for reading in sunlight — which, for this app, is
 *                  a hospital forecourt at midday.
 *
 * `voiceInput`     Dictation on long form fields. Requires a development build; see
 *                  `services/voiceInput.js`.
 */
export const DEFAULT_PREFERENCES = Object.freeze({
  voiceGuidance: false,
  bigText: false,
  highContrast: false,
  voiceInput: false,
});

let current = DEFAULT_PREFERENCES;
let hydrated = false;
const listeners = new Set();

function emit() {
  for (const listener of listeners) listener();
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Subscribe to changes. The signature `useSyncExternalStore` expects. */
export function subscribePreferences(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current preferences. Stable identity until something actually changes. */
export function getPreferences() {
  return current;
}

/** Whether the stored values have been read back yet. */
export function preferencesHydrated() {
  return hydrated;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

async function persist(next) {
  const raw = JSON.stringify(next);
  try {
    if (isWeb) globalThis.localStorage?.setItem(KEY, raw);
    else await SecureStore.setItemAsync(KEY, raw);
  } catch {
    // Storage refused. The preference is still live for this session, which is the part the
    // user asked for; it just will not survive a restart.
  }
}

/**
 * Change one preference. Applies immediately and saves in the background — the UI must not
 * wait on a keystore write to redraw at a size the user can read.
 */
export function setPreference(key, value) {
  if (!(key in DEFAULT_PREFERENCES)) return current;
  if (current[key] === value) return current;

  current = Object.freeze({ ...current, [key]: value });
  emit();
  persist(current);
  return current;
}

/** Back to defaults — the escape hatch on the settings screen. */
export function resetPreferences() {
  current = DEFAULT_PREFERENCES;
  emit();
  persist(current);
  return current;
}

// ---------------------------------------------------------------------------
// Hydration
// ---------------------------------------------------------------------------

/**
 * Read the saved values back.
 *
 * Started as soon as this module is imported, so it is usually resolved before the first
 * screen paints. Anything rendered in the meantime uses the defaults and re-renders when the
 * real values arrive — a brief flash at default size, rather than blocking the whole app on
 * a keystore read.
 */
export async function hydratePreferences() {
  try {
    const raw = isWeb ? (globalThis.localStorage?.getItem(KEY) ?? null) : await SecureStore.getItemAsync(KEY);

    if (raw) {
      const stored = JSON.parse(raw);
      // Only known keys, and only booleans. A value written by a newer build — or a corrupted
      // one — must not be able to put an unknown shape into the store.
      const merged = { ...DEFAULT_PREFERENCES };
      for (const key of Object.keys(DEFAULT_PREFERENCES)) {
        if (typeof stored?.[key] === 'boolean') merged[key] = stored[key];
      }
      current = Object.freeze(merged);
    }
  } catch {
    // Unreadable or written by an older build. Defaults are a safe place to land.
  } finally {
    hydrated = true;
    emit();
  }

  return current;
}

hydratePreferences();
