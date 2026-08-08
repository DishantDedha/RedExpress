import { useCallback, useEffect, useRef } from 'react';
import { AccessibilityInfo, Platform, View, StyleSheet } from 'react-native';
import { AppText } from './AppText';
import { speak, voiceGuidanceActive } from '../services/voiceGuidance';
import { colors, spacing, radius, a11y } from '../theme';

/**
 * Announcing things that happen without a tap.
 *
 * "OTP sent", "Searching…", "3 donors found", "That code was wrong" — a sighted user sees
 * these appear. A screen-reader user is told nothing, because nothing they are focused on
 * changed. This is the gap that makes an app technically navigable but useless in practice,
 * and it is why the requirement runs through every phase: async state changes are announced.
 *
 * ## Why the platform split
 *
 * There are two mechanisms and using both at once is a bug:
 *
 *   Android — `accessibilityLiveRegion="polite"` on a View makes TalkBack read its contents
 *             whenever they change. It is automatic and correctly queued.
 *   iOS     — VoiceOver ignores `accessibilityLiveRegion` entirely. It needs an explicit
 *             `announceForAccessibility` call.
 *
 * Calling `announceForAccessibility` on Android *as well* as marking the live region makes
 * TalkBack say everything twice. So each platform gets exactly one of the two.
 *
 * ## Announcements are not a substitute for visible text
 *
 * `LiveMessage` renders its message on screen as well as speaking it. An announcement that
 * is never drawn is invisible to a low-vision user with magnification, to a deaf-blind user
 * on a braille display reading at their own pace, and to anyone who looked away. The spoken
 * and the visible message are the same message.
 *
 * ## Voice guidance (Phase 11)
 *
 * `announceForAccessibility` does nothing at all when no screen reader is running — so every
 * "3 donors found" and "That code was wrong" in this app was, until Phase 11, silent for a
 * user who has not set TalkBack up.
 *
 * Routing the voice-guidance preference through this one function fixes that everywhere at
 * once: every existing `say(...)` call across the app becomes audible, without a single
 * screen having to know that voice guidance exists. The channel is chosen per message, never
 * both — see `services/voiceGuidance.js` for the double-speaking rule.
 */

// TalkBack drops announcements that arrive while it is already speaking, so they are queued
// and spaced out rather than fired the instant they are requested.
let queue = [];
let draining = false;

function drain() {
  if (draining) return;
  const next = queue.shift();
  if (!next) return;

  draining = true;

  // One channel per message, never two. `speak` is a no-op unless voice guidance is on *and*
  // no screen reader is running, so exactly one of these two lines does the work.
  if (!speak(next)) AccessibilityInfo.announceForAccessibility(next);

  setTimeout(() => {
    draining = false;
    drain();
  }, a11y.announceDebounceMs);
}

/**
 * Speak a message immediately, with no accompanying UI.
 *
 * For events with nowhere to render — "Signed out", a screen that is about to unmount. When
 * there *is* somewhere to put the text, prefer the `<LiveMessage>` component.
 */
export function announce(message) {
  if (!message) return;
  queue.push(String(message));
  drain();
}

/** Drop anything not yet spoken. Called when a screen unmounts so its stale messages do not
 *  follow the user to the next one. */
export function clearAnnouncements() {
  queue = [];
}

/**
 * Hook form, for announcing from an event handler.
 *
 *   const say = useAnnounce();
 *   await requestOtp(phone);
 *   say(`One time password sent to ${masked}`);
 */
export function useAnnounce() {
  useEffect(() => clearAnnouncements, []);
  return useCallback(announce, []);
}

// ---------------------------------------------------------------------------

const TONE = {
  // Each tone carries a word as well as a colour. WCAG 1.4.1 forbids colour as the only
  // carrier of meaning, and to a blind user the colour does not exist at all — the prefix
  // is the entire signal.
  info: { fg: colors.info, bg: colors.infoTint, prefix: '' },
  success: { fg: colors.success, bg: colors.successTint, prefix: 'Success. ' },
  error: { fg: colors.error, bg: colors.errorTint, prefix: 'Error. ' },
  warning: { fg: colors.warning, bg: colors.warningTint, prefix: 'Warning. ' },
  // Progress: announced, but the visible chrome stays quiet so a spinner does not become a
  // full banner.
  progress: { fg: colors.textMuted, bg: 'transparent', prefix: '' },
};

/**
 * A live region that shows and speaks a message.
 *
 *   <LiveMessage message={status} tone="success" />
 *
 * Re-announces whenever `message` changes, and stays silent when it is empty. Setting the
 * same message twice in a row does not re-announce — pass a new string (or clear it first)
 * if a repeat genuinely needs to be heard again.
 */
export function LiveMessage({ message, tone = 'info', style, visible = true, onBrand = false }) {
  const spoken = useRef(null);
  const { fg, bg, prefix } = TONE[tone] ?? TONE.info;

  // The banner tones all paint their own light background, so they survive on a red screen
  // unchanged. `progress` deliberately does not — it is bare text next to a spinner — and
  // its muted grey disappears on red, so on a brand surface it borrows the pale pink.
  const foreground = onBrand && tone === 'progress' ? colors.onBrandMuted : fg;

  useEffect(() => {
    if (!message) {
      spoken.current = null;
      return;
    }
    if (spoken.current === message) return;
    spoken.current = message;

    if (Platform.OS !== 'android') {
      // Android's live region below handles this natively; announcing here too would
      // double-speak.
      announce(`${prefix}${message}`);
    } else if (voiceGuidanceActive()) {
      // ...but a live region is a *screen-reader* mechanism. With no reader running it is
      // silent, so under voice guidance the message has to be spoken here instead.
      speak(`${prefix}${message}`);
    }
  }, [message, prefix]);

  if (!message || !visible) {
    // Still rendered, and still a live region: TalkBack watches this node for changes, and a
    // node that unmounts and remounts is a new node it is not yet watching.
    return <View accessibilityLiveRegion="polite" style={styles.empty} />;
  }

  return (
    <View
      accessibilityLiveRegion="polite"
      // "status" maps to an assertive-but-not-alarming announcement; the tone prefix above
      // supplies the severity.
      accessibilityRole={tone === 'error' ? 'alert' : 'text'}
      style={[styles.container, { backgroundColor: bg }, tone === 'progress' && styles.bare, style]}
    >
      <AppText variant="caption" color={foreground} style={styles.text}>
        {prefix}
        {message}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  empty: { height: 0 },
  container: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    marginTop: spacing.sm,
  },
  bare: { paddingVertical: spacing.xs, paddingHorizontal: 0 },
  text: { flexShrink: 1 },
});

export default LiveMessage;
