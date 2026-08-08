import { useCallback, useSyncExternalStore } from 'react';
import {
  getPreferences,
  preferencesHydrated,
  resetPreferences,
  setPreference,
  subscribePreferences,
} from '../services/preferences';
import { highContrast as hc } from '../theme';

/**
 * Reading the accessibility preferences from a component.
 *
 * `useSyncExternalStore` rather than a context, for the reason set out in
 * `services/preferences.js`: `AppText` needs the text scale and `AppText` is everywhere,
 * including inside modals that render outside the screen tree. There is no provider to
 * forget to wrap.
 */

/**
 * The raw snapshot, and the cheapest of these hooks.
 *
 * `AppText` uses this one: it runs for every piece of text on every screen, so it does the one
 * subscription it needs and nothing else. The convenience wrappers below build on it.
 */
export function usePreferencesSnapshot() {
  return useSyncExternalStore(subscribePreferences, getPreferences, getPreferences);
}

/** All of them, plus setters. For the settings screen. */
export function usePreferences() {
  const preferences = usePreferencesSnapshot();
  const hydrated = useSyncExternalStore(subscribePreferences, preferencesHydrated, preferencesHydrated);

  const set = useCallback((key, value) => setPreference(key, value), []);
  const reset = useCallback(() => resetPreferences(), []);

  return { preferences, hydrated, set, reset };
}

/** One preference, when a component only cares about one. */
export function usePreference(key) {
  return usePreferencesSnapshot()[key];
}

/**
 * Whether high contrast is on, together with the substitutions to apply.
 *
 * Returning the tokens alongside the flag keeps the decision in one place: a component asks
 * "what colour should this border be" rather than each one re-deciding what high contrast
 * means for an edge.
 */
export function useHighContrast() {
  const on = usePreference('highContrast');

  return {
    on,
    /** Swap a border colour. Pass the colour the component would otherwise have used. */
    border: (normal) => (on ? hc.border : normal),
    /** Swap a divider or card edge. */
    borderMuted: (normal) => (on ? hc.borderMuted : normal),
    /** Swap a brand fill for the AAA-contrast one. */
    fill: (normal) => (on ? hc.primary : normal),
    /** Border width for a control at rest, and when focused or in error. */
    width: (normal) => (on ? Math.max(normal, hc.borderWidth) : normal),
    focusWidth: (normal) => (on ? Math.max(normal, hc.focusWidth) : normal),
  };
}
