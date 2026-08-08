import { useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { announce } from './LiveMessage';
import { focusOn } from '../hooks/useAccessibilityFocus';
import { useHighContrast } from '../hooks/usePreferences';
import { hapticSelection } from '../services/feedback';
import { colors, spacing, radius, a11y, highContrast } from '../theme';

/**
 * A real checkbox — the terms-and-conditions control on the donor form.
 *
 * The mockup draws a small red square. Built literally, that is a `View` with a tap handler:
 * invisible to a screen reader, impossible to know the state of, and under the 48dp minimum.
 * So this declares what it is:
 *
 *   `accessibilityRole="checkbox"` + `accessibilityState={{ checked }}` — the reader
 *   announces "I agree to the terms and conditions, checkbox, not checked", and says
 *   "checked" when it changes. Without the state, a blind user has no way to tell whether
 *   their tap registered, which on a form that will not submit without it is a trap.
 *
 * The tick is not the only signal. The box fills *and* shows a tick glyph *and* the state is
 * spoken, because a red-versus-white square is nothing in greyscale, and nothing at all to
 * someone who cannot see it.
 *
 * The label is inside the pressable, so tapping the words toggles the box — the target is the
 * whole row, not a 20-pixel square.
 */
export function AppCheckbox({
  label,
  checked = false,
  onChange,
  error,
  /** Longer explanation rendered under the label and offered as the accessibility hint. */
  helperText,
  disabled = false,
  tone = 'default',
  accessibilityLabel,
  accessibilityHint,
  style,
  ref,
}) {
  const brand = tone === 'brand';
  const boxRef = useRef(null);
  const lastError = useRef(null);
  const contrast = useHighContrast();

  // Errors announce on Android through the live region below; iOS needs the explicit call.
  useEffect(() => {
    if (!error) {
      lastError.current = null;
      return;
    }
    if (lastError.current === error) return;
    lastError.current = error;
    if (Platform.OS !== 'android') announce(`Error. ${label}. ${error}`);
  }, [error, label]);

  // Same imperative surface as AppTextInput, so "focus the first invalid field" can treat
  // every control in a form the same way. A checkbox takes no keyboard focus of its own, so
  // all three do the same thing: move the reader's cursor here.
  useImperativeHandle(ref, () => ({
    focus: () => focusOn(boxRef),
    focusForAccessibility: () => focusOn(boxRef),
    focusAll: () => focusOn(boxRef),
  }));

  function toggle() {
    if (disabled) return;
    hapticSelection();
    onChange?.(!checked);
  }

  const composedLabel = [accessibilityLabel ?? label, error ? `Error: ${error}` : null]
    .filter(Boolean)
    .join(', ');

  return (
    <View style={style}>
      <Pressable
        ref={boxRef}
        onPress={toggle}
        disabled={disabled}
        accessibilityRole="checkbox"
        accessibilityLabel={composedLabel}
        accessibilityHint={accessibilityHint ?? helperText}
        accessibilityState={{ checked, disabled }}
        style={({ pressed }) => [styles.row, pressed && !disabled && styles.pressed]}
      >
        <View
          style={[
            styles.box,
            checked && styles.boxChecked,
            // An unchecked box is a thin grey outline, and it is the one control on the donor
            // form that blocks submission — it has to be findable.
            contrast.on &&
              (checked
                ? { backgroundColor: highContrast.primary, borderColor: highContrast.border }
                : { borderColor: highContrast.border, borderWidth: 3 }),
            error && styles.boxError,
            disabled && styles.boxDisabled,
          ]}
          // Decorative: the state is carried by accessibilityState on the row above, and
          // repeating it here would have the reader say "tick" as well as "checked".
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {checked ? (
            <AppText variant="bodyStrong" color={colors.onPrimary} style={styles.tick}>
              ✓
            </AppText>
          ) : null}
        </View>

        <View style={styles.labelBlock}>
          <AppText variant="body" color={brand ? colors.onPrimary : colors.text}>
            {label}
          </AppText>
          {helperText ? (
            <AppText
              variant="caption"
              color={brand ? colors.onBrandMuted : colors.textMuted}
              style={styles.helper}
            >
              {helperText}
            </AppText>
          ) : null}
        </View>
      </Pressable>

      {/* Always mounted, so TalkBack is already watching the node when the error appears. */}
      <View accessibilityLiveRegion="polite">
        {error ? (
          <AppText variant="caption" color={colors.error} style={styles.error}>
            Error: {error}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    // The whole row is the target, and it clears 48dp even when the label is one short line.
    minHeight: a11y.minTouchTarget,
    paddingVertical: spacing.sm,
  },
  pressed: { opacity: 0.7 },
  box: {
    width: 26,
    height: 26,
    borderRadius: radius.sm,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    // Keeps the box aligned with the first line of a label that wraps to three lines.
    marginTop: 2,
  },
  boxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
  boxError: { borderColor: colors.error },
  boxDisabled: { borderColor: colors.borderDisabled, backgroundColor: colors.background },
  tick: { lineHeight: 20 },
  labelBlock: { flex: 1 },
  helper: { marginTop: spacing.xs },
  error: { marginTop: spacing.xs },
});

export default AppCheckbox;
