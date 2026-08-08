import { useCallback, useEffect, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { speakScreen, stopSpeaking } from '../services/voiceGuidance';
import { a11y } from '../theme';

/**
 * Reading a screen aloud when it opens.
 *
 * Mirrors `useHeadingFocus`, which moves the *screen reader's* cursor to the heading, and for
 * the same reason: arriving somewhere new and being told nothing about it is disorienting.
 * This is the equivalent for a user with no screen reader running.
 *
 * ## Timing
 *
 * Spoken after `focusDelayMs * 2` — deliberately later than the heading focus. If a reader
 * *is* running, `speakScreen` is already silent, but the delay also means a screen the user
 * is passing straight through (a redirect, a tap-through from a notification) is not spoken
 * over the screen they actually land on. Anything that unmounts inside the delay is silent.
 *
 * ## Once per visit
 *
 * `useFocusEffect`, so coming back from a modal or a child screen re-introduces where you
 * are — which is exactly when someone who cannot see the transition needs telling. The guard
 * ref stops a re-render inside a single visit from repeating it.
 */
export function useScreenIntroduction({ title, purpose, action, enabled = true }) {
  const spokenFor = useRef(null);

  useFocusEffect(
    useCallback(() => {
      if (!enabled || !title) return undefined;

      const key = `${title}|${purpose ?? ''}|${action ?? ''}`;
      if (spokenFor.current === key) return undefined;

      const timer = setTimeout(() => {
        spokenFor.current = key;
        speakScreen({ title, purpose, action });
      }, a11y.focusDelayMs * 2);

      return () => {
        clearTimeout(timer);
        // Leaving the screen cuts off its description. Hearing the previous screen finish
        // introducing itself over the new one is the fastest way to make this feature
        // unbearable.
        stopSpeaking();
        spokenFor.current = null;
      };
    }, [enabled, title, purpose, action]),
  );
}

/**
 * Stop any speech when the component unmounts.
 *
 * For screens that speak outside the introduction — a long request summary — so navigating
 * away silences it rather than letting it run on over the next screen.
 */
export function useStopSpeakingOnLeave() {
  useEffect(() => stopSpeaking, []);
}
