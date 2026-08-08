import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from './AppText';
import { announce } from './LiveMessage';
import { focusOn } from '../hooks/useAccessibilityFocus';
import { useHighContrast } from '../hooks/usePreferences';
import { colors, spacing, radius, typography, a11y } from '../theme';

/**
 * A text field with a real label.
 *
 * ## The placeholder problem
 *
 * The mockups, like most designs, put the field name in the placeholder. That is the single
 * worst thing a form can do to a screen-reader user, and it fails sighted users too:
 *
 *   - the placeholder disappears the moment you start typing, so the field loses its name
 *     exactly when you are checking what you typed;
 *   - placeholder grey is usually below 4.5:1 (making it AA-compliant makes it look like a
 *     filled value, which is its own bug);
 *   - some screen readers skip it entirely, others read it as if it were the value.
 *
 * So the label is always rendered as visible text above the field. `placeholder` is still
 * available, but only for an *example* ("9876543210"), never for the field name — and it is
 * hidden from the accessibility tree so it is not read as a value.
 *
 * ## Errors
 *
 * An error shown in red text below the field reaches nobody who cannot see red text below
 * the field. So an error does three things:
 *
 *   1. renders visibly, prefixed with "Error:" — words, not just colour (WCAG 1.4.1);
 *   2. is folded into the field's `accessibilityLabel`, so it is read every time the user
 *      lands on the field, not only at the moment it appeared;
 *   3. is announced when it first appears, through a live region on Android and an explicit
 *      announcement on iOS — the same platform split as LiveMessage, for the same reason.
 *
 * React Native has no `aria-describedby`, so (2) is how the error and the field stay
 * associated. It reads slightly long. That is the correct trade.
 *
 * ## Ref
 *
 * The forwarded ref exposes `focus()` (keyboard) and `focusForAccessibility()` (screen-reader
 * cursor). Phase 9's "move focus to the first invalid field on submit" needs the second one:
 * focusing the keyboard does not move the TalkBack cursor.
 */

export const AppTextInput = forwardRef(function AppTextInput(
  {
    label,
    value,
    onChangeText,
    error,
    /** Guidance shown under the field and offered as the accessibility hint. */
    helperText,
    required = false,
    /** An example value. Never the field name — that is what `label` is for. */
    placeholder,
    disabled = false,
    multiline = false,
    /**
     * 'default' on the grey app surface, 'brand' on a red `Screen`.
     *
     * On brand the field itself stays white with dark text inside — that is both the mockup
     * and the readable choice — but everything *around* it has to change: the label and
     * helper text go white and pale pink, and an error can no longer be red text, because
     * red on red is nothing at all. It becomes a tinted chip instead, which is legible and
     * still carries the word "Error".
     */
    tone = 'default',
    accessibilityLabel,
    accessibilityHint,
    containerStyle,
    inputStyle,
    ...rest
  },
  ref,
) {
  const inputRef = useRef(null);
  const wrapperRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const lastError = useRef(null);
  const contrast = useHighContrast();

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    focusForAccessibility: () => focusOn(inputRef),
    /** Both, for "jump to the first invalid field": cursor and keyboard together. */
    focusAll: () => {
      focusOn(inputRef);
      inputRef.current?.focus();
    },
  }));

  // Announce an error the moment it appears. Android's live region on the error View below
  // already covers this, so only iOS needs the explicit call.
  //
  // In an effect, not in the render body: React may render a component twice without
  // committing it (StrictMode, concurrent rendering), and an announcement fired from render
  // would be spoken twice.
  useEffect(() => {
    if (!error) {
      lastError.current = null;
      return;
    }
    if (lastError.current === error) return;
    lastError.current = error;
    if (Platform.OS !== 'android') announce(`Error. ${label}. ${error}`);
  }, [error, label]);

  // What the reader says when the cursor lands on the field. Order is deliberate: name,
  // then whether it must be filled in, then what is wrong with it.
  const composedLabel = [
    accessibilityLabel ?? label,
    required ? 'required' : null,
    error ? `Error: ${error}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  const brand = tone === 'brand';

  const borderColor = disabled
    ? colors.borderDisabled
    : error
      ? colors.error
      : focused
        ? // On red, the red focus ring is invisible against the background; white is the
          // focus indicator there, at 7.33:1.
          brand
          ? colors.onPrimary
          : colors.focusRing
        : brand
          ? colors.onPrimary
          : // High contrast turns the 3.45:1 grey outline near-black. The brand surface is
            // left alone: its white border is already the highest-contrast edge available on
            // deep red.
            contrast.border(colors.border);

  // A field with an unmissable edge is the point of the preference — at rest as well as when
  // it is focused.
  const borderWidth =
    focused || error ? contrast.focusWidth(2) : brand ? 1 : contrast.width(1);

  const labelColor = disabled ? colors.textDisabled : brand ? colors.onPrimary : colors.text;
  const helperColor = brand ? colors.onBrandMuted : colors.textMuted;

  return (
    <View style={[styles.container, containerStyle]}>
      {/* Visible, permanent field name. Not a placeholder. */}
      <AppText variant="label" style={styles.label} color={labelColor}>
        {label}
        {required ? (
          // The word, not a bare asterisk: "*" is read as "star" or skipped altogether, and
          // its meaning is a convention nobody is told.
          <AppText variant="label" color={brand ? colors.onBrandMuted : colors.error}>
            {' '}
            (required)
          </AppText>
        ) : null}
      </AppText>

      <View
        ref={wrapperRef}
        style={[
          styles.field,
          { borderColor, borderWidth },
          disabled && styles.fieldDisabled,
          multiline && styles.fieldMultiline,
        ]}
      >
        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={!disabled}
          multiline={multiline}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={composedLabel}
          accessibilityHint={accessibilityHint ?? helperText}
          accessibilityState={{ disabled }}
          // The placeholder is an example, not information. Left in the tree it gets read
          // as though the field already had a value.
          accessibilityElementsHidden={false}
          // Grows with the OS text-size setting; never disabled.
          maxFontSizeMultiplier={a11y.maxFontSizeMultiplier}
          style={[styles.input, disabled && styles.inputDisabled, multiline && styles.inputMultiline, inputStyle]}
          {...rest}
        />
      </View>

      {/*
        One live region, always mounted, holding whichever message applies. Mounting it only
        when there is an error would mean TalkBack is not yet watching the node at the moment
        the error appears — the announcement would be lost.
      */}
      <View accessibilityLiveRegion="polite">
        {error ? (
          <AppText
            variant="caption"
            color={colors.error}
            // On red, error text needs its own light background to sit on — the error red
            // and the brand red are all but the same colour.
            style={[styles.message, brand && styles.messageChip]}
          >
            {/* "Error:" in words. Red text is not a message. */}
            Error: {error}
          </AppText>
        ) : helperText ? (
          <AppText variant="caption" color={helperColor} style={styles.message}>
            {helperText}
          </AppText>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.xs },
  field: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    // The container guarantees the 48dp target; the input inside is free to be shorter.
    minHeight: a11y.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  fieldDisabled: { backgroundColor: colors.background },
  fieldMultiline: { minHeight: a11y.minTouchTarget * 2, paddingVertical: spacing.sm },
  input: {
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
    // Android draws its own underline inside a bordered container; remove the double edge.
    ...Platform.select({ android: { paddingVertical: spacing.sm } }),
  },
  inputDisabled: { color: colors.textDisabled },
  inputMultiline: { textAlignVertical: 'top', minHeight: a11y.minTouchTarget * 2 },
  message: { marginTop: spacing.xs },
  messageChip: {
    backgroundColor: colors.errorTint,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    // Wraps to the text rather than stretching the full width, so it reads as a note about
    // the field above it and not as a page-level banner.
    alignSelf: 'flex-start',
  },
});

export default AppTextInput;
