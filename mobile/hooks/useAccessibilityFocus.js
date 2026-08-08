import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, findNodeHandle } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { a11y } from '../theme';

/**
 * Screen-reader focus management.
 *
 * A sighted user's eye lands on the top of a new screen for free. A screen-reader user's
 * does not: unless focus is moved deliberately, TalkBack and VoiceOver leave the cursor
 * wherever it was — often on the back button, or on nothing at all — and the user has to
 * swipe backwards to work out where they are. Moving focus to the heading on every screen
 * entry is the single change that makes navigation coherent.
 */

/** Point the screen reader at a rendered element. Safe to call when no reader is running. */
export function focusOn(ref) {
  if (!ref?.current) return false;
  const tag = findNodeHandle(ref.current);
  if (!tag) return false;
  AccessibilityInfo.setAccessibilityFocus(tag);
  return true;
}

/**
 * Returns a ref to attach to a screen's heading. Focus moves there on mount and again
 * whenever the screen is navigated back to.
 *
 * The delay matters. Both platforms announce the screen transition itself, and a focus
 * request made during that announcement is discarded — the symptom is "it works sometimes",
 * which is the worst kind of accessibility bug because it survives testing. `focusDelayMs`
 * lands just after the transition settles. It retries once, because a slow first render can
 * still beat it.
 */
export function useHeadingFocus({ enabled = true } = {}) {
  const ref = useRef(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;

      const timers = [
        setTimeout(() => focusOn(ref), a11y.focusDelayMs),
        setTimeout(() => focusOn(ref), a11y.focusDelayMs * 2),
      ];

      return () => timers.forEach(clearTimeout);
    }, [enabled]),
  );

  return ref;
}

/**
 * Move focus on demand — used when validation fails, to send the user to the first invalid
 * field rather than announcing "3 errors" and leaving them to find them (Phase 9), and when
 * search results arrive (Phase 10).
 */
export function useFocusMover() {
  return useCallback((ref, delayMs = 100) => {
    const timer = setTimeout(() => focusOn(ref), delayMs);
    return () => clearTimeout(timer);
  }, []);
}

/**
 * Whether a screen reader is currently running.
 *
 * Used to avoid double-speaking: the optional voice-guidance mode in Phase 11 reads screens
 * aloud with expo-speech, which would talk over TalkBack if both were active. Also lets a
 * component skip work that only matters to a reader.
 *
 * Tracked as state, not read once — a user can turn VoiceOver on mid-session, and often
 * does exactly that when they hit something they cannot see.
 */
export function useScreenReaderEnabled() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let active = true;

    AccessibilityInfo.isScreenReaderEnabled().then((value) => {
      if (active) setEnabled(value);
    });

    const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);

    return () => {
      active = false;
      subscription?.remove();
    };
  }, []);

  return enabled;
}
