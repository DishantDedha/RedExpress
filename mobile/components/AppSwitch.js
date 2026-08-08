import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { AppText } from './AppText';
import { useHighContrast } from '../hooks/usePreferences';
import { hapticSelection } from '../services/feedback';
import { colors, spacing, a11y, highContrast } from '../theme';

/**
 * A labelled switch — "Available to donate" on the profile screen.
 *
 * ## The whole row is the control
 *
 * The obvious build is a label beside a platform `Switch`. It fails the Phase 11 audit twice:
 *
 *   target   The `Switch` is the only tappable region — about 50 by 30 points, well under the
 *            48dp minimum (WCAG 2.5.5), and the words next to it do nothing. Tapping a
 *            control's label is a universal expectation and it is the *only* comfortable way
 *            to hit it with a tremor.
 *
 *   stops    The label, the state sentence and the helper text are three separate nodes a
 *            screen-reader user swipes past before reaching a fourth node that then repeats
 *            the label and the state back at them. Four stops for one control.
 *
 * So the row itself is the accessible element: `accessibilityRole="switch"` with the state as
 * `accessibilityState.checked` and the meaning as `accessibilityValue.text`. It is one stop,
 * it announces "Available to donate, switch, on, you are shown as available", it activates
 * with a double-tap from either reader, and it is 48dp tall across the full width.
 *
 * The platform `Switch` inside is then purely a picture of the state: `pointerEvents="none"`
 * so it cannot swallow the tap, and hidden from the accessibility tree so it cannot become a
 * second stop announcing the same thing.
 *
 * ## The state is also written out in words
 *
 * A switch communicates through position and colour: knob left/grey, knob right/red. Neither
 * reaches a blind user, and colour alone fails WCAG 1.4.1 for everyone else. So the current
 * state is rendered as text — "You are shown as available to donate" — next to the control.
 * A sighted user reads it; a screen-reader user hears it as the control's value; and the
 * caller announces the *consequence* after a successful save, because what matters is not
 * "on" but "other people can now find you".
 */
export function AppSwitch({
  label,
  value = false,
  onValueChange,
  /** What being on/off actually means, shown under the label and spoken as the value. */
  onText = 'On',
  offText = 'Off',
  helperText,
  disabled = false,
  loading = false,
  accessibilityLabel,
  accessibilityHint,
  style,
}) {
  const contrast = useHighContrast();
  const stateText = value ? onText : offText;
  const inert = disabled || loading;

  function toggle() {
    if (inert) return;
    hapticSelection();
    onValueChange?.(!value);
  }

  return (
    <Pressable
      onPress={toggle}
      disabled={inert}
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint ?? helperText}
      // `checked` drives "on"/"off"; `busy` covers the moment between the tap and the server
      // confirming, so the reader does not report a state that has not saved yet.
      accessibilityState={{ checked: value, disabled: inert, busy: loading }}
      // The meaning, not the position. "On" says nothing about what is on.
      accessibilityValue={{ text: stateText }}
      style={({ pressed }) => [styles.row, pressed && !inert && styles.pressed, inert && styles.inert, style]}
    >
      <View style={styles.labelBlock}>
        <AppText variant="bodyStrong">{label}</AppText>

        {/* The state in words. Not decoration: this is the only channel that survives
            greyscale, and the only one a sighted low-vision user gets when reading the screen
            rather than focusing the control. */}
        <AppText variant="caption" color={colors.textMuted} style={styles.state}>
          {stateText}
        </AppText>

        {helperText ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.helper}>
            {helperText}
          </AppText>
        ) : null}
      </View>

      {/*
        A picture of the state, nothing more. The row above owns the interaction and the
        semantics; leaving this in the tree would make it a second stop saying the same thing,
        and leaving it tappable would put a small target inside a large one.

        `pointerEvents` is set on a wrapping View rather than on the `Switch` itself, because
        the platform switch renders a native control and how reliably it honours the prop
        varies. A View is unambiguous on both platforms.
      */}
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Switch
          value={value}
          disabled={inert}
          trackColor={{
            false: colors.borderDisabled,
            true: contrast.on ? highContrast.primary : colors.primary,
          }}
          thumbColor={colors.card}
          ios_backgroundColor={colors.borderDisabled}
          style={styles.switch}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: a11y.minTouchTarget,
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  // Pressing the row is confirmed visually as well as by the haptic, since the knob only
  // moves once the caller has accepted the change.
  pressed: { opacity: 0.7 },
  inert: { opacity: 0.6 },
  labelBlock: { flex: 1 },
  state: { marginTop: spacing.xs },
  helper: { marginTop: spacing.xs },
  // Nudged up on Android, where the platform switch is smaller than the iOS one.
  switch: { transform: [{ scale: 1.1 }] },
});

export default AppSwitch;
