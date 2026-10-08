import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
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
    /** Pulled out of `...rest` so the autofill reconcile below can run before it. */
    onEndEditing,
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
    /**
     * Masks the value. Pulled out of `...rest` rather than passed straight through, because
     * a masked field also gets a reveal toggle — see `revealed` below.
     */
    secureTextEntry = false,
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

  /**
   * "Show password".
   *
   * A masked field asks someone to type a string they cannot check, on a phone keyboard, and
   * then blames them when it does not match. The toggle is the standard fix and it is a
   * genuine accessibility feature, not a convenience: it is most useful to people with motor
   * or dexterity difficulties and to anyone using an unfamiliar keyboard layout.
   *
   * Off by default — the value is still a secret in a public place — and it never persists
   * between fields or mounts.
   *
   * The button, not the glyph, carries the name. `Icon` hides every glyph from the
   * accessibility tree by design, so the Pressable is labelled with the action it performs
   * and the change is announced, since a screen-reader user gets no visual confirmation
   * that the masking changed.
   */
  const [revealed, setRevealed] = useState(false);
  const canReveal = Boolean(secureTextEntry) && !disabled;

  function toggleReveal() {
    setRevealed((current) => {
      const next = !current;
      announce(next ? `${label} is now visible.` : `${label} is hidden.`);
      return next;
    });
  }

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
          // focus indicator there, at 5.98:1.
          brand
          ? colors.onPrimary
          : colors.focusRing
        : brand
          ? colors.onPrimary
          : // High contrast turns the 3.69:1 grey outline near-black. The brand surface is
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
          canReveal && styles.fieldWithToggle,
        ]}
      >
        <TextInput
          ref={inputRef}
          secureTextEntry={canReveal ? !revealed : secureTextEntry}
          value={value}
          onChangeText={onChangeText}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          /**
           * Catches a value the native field has but React does not.
           *
           * Android's autofill writes straight into the EditText. On a controlled TextInput
           * that can land without `onChangeText` firing, and the two then disagree silently:
           * the field shows a password, `value` is still `''`, and submitting reports "Enter
           * a password" under a box the user can plainly see is filled. Nothing recovers on
           * its own, because React only pushes `value` down when it *changes* — and `''` to
           * `''` is not a change.
           *
           * `onEndEditing` reports what the native field actually holds, so one reconcile
           * when focus leaves is enough. For ordinary typing the text already matches and
           * this is a no-op.
           */
          onEndEditing={(event) => {
            const native = event.nativeEvent?.text;
            if (typeof native === 'string' && native !== value) onChangeText?.(native);
            onEndEditing?.(event);
          }}
          editable={!disabled}
          multiline={multiline}
          placeholder={placeholder}
          /**
           * Neutral-500, not `textMuted`.
           *
           * A placeholder here is an example value ("9876543210"), and the field's name is
           * always visible above it, so this grey is carrying no information anyone needs. At
           * `textMuted` — which is neutral-600 — an example looked like a value the user had
           * already typed, which is the opposite of what an example is for. Neutral-500 is
           * still 4.74:1, so it is readable as text; it just stops pretending to be input.
           */
          placeholderTextColor={colors.neutralRamp[500]}
          accessibilityLabel={composedLabel}
          accessibilityHint={accessibilityHint ?? helperText}
          accessibilityState={{ disabled }}
          // The placeholder is an example, not information. Left in the tree it gets read
          // as though the field already had a value.
          accessibilityElementsHidden={false}
          // Grows with the OS text-size setting; never disabled.
          maxFontSizeMultiplier={a11y.maxFontSizeMultiplier}
          style={[
            styles.input,
            disabled && styles.inputDisabled,
            multiline && styles.inputMultiline,
            canReveal && styles.inputFlex,
            inputStyle,
          ]}
          {...rest}
        />

        {canReveal ? (
          <Pressable
            onPress={toggleReveal}
            // The field's own 48dp height plus this width makes the target square; a 24px
            // glyph on its own would be half the minimum and unhittable in a hurry.
            style={({ pressed }) => [styles.toggle, pressed && styles.togglePressed]}
            accessibilityRole="button"
            // Names the action, not the state: "Show password" is what pressing it does.
            accessibilityLabel={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            accessibilityHint={
              revealed
                ? 'Masks the characters again'
                : 'Displays the characters so you can check what you typed'
            }
            // Excluded from the form's tab order would be wrong — it is a real control — but
            // it must not be mistaken for part of the field above it.
            accessibilityState={{ expanded: revealed }}
          >
            <Icon name={revealed ? 'eyeOff' : 'eye'} size={22} color={colors.text} />
          </Pressable>
        ) : null}
      </View>

      {/*
        One live region, always mounted, holding whichever message applies. Mounting it only
        when there is an error would mean TalkBack is not yet watching the node at the moment
        the error appears — the announcement would be lost.
      */}
      <View accessibilityLiveRegion="polite">
        {error ? (
          <AppText
            variant="footnote"
            color={colors.error}
            // On red, error text needs its own light background to sit on — the error red
            // and the brand red are all but the same colour.
            style={[styles.message, brand && styles.messageChip]}
          >
            {/* "Error:" in words. Red text is not a message. */}
            Error: {error}
          </AppText>
        ) : helperText ? (
          <AppText variant="footnote" color={helperColor} style={styles.message}>
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
  /** GMP's field: a 12px radius and 16px of air inside it, not 8 and 12. */
  field: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    // The container guarantees the 48dp target; the input inside is free to be shorter.
    minHeight: a11y.minTouchTarget,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  fieldDisabled: { backgroundColor: colors.surface },
  fieldMultiline: { minHeight: a11y.minTouchTarget * 2, paddingVertical: spacing.sm },
  /**
   * Row layout, and the right padding handed to the toggle so the glyph is not inset twice.
   * Only applied when there is a toggle — a plain field keeps its original single-child
   * centring.
   */
  fieldWithToggle: { flexDirection: 'row', alignItems: 'center', paddingRight: 0 },
  input: {
    ...typography.body,
    color: colors.text,
    paddingVertical: spacing.md,
    // Android draws its own underline inside a bordered container; remove the double edge.
    ...Platform.select({ android: { paddingVertical: spacing.sm } }),
  },
  inputDisabled: { color: colors.textDisabled },
  inputMultiline: { textAlignVertical: 'top', minHeight: a11y.minTouchTarget * 2 },
  /** Takes the row's spare width so the toggle sits hard against the field's right edge. */
  inputFlex: { flex: 1 },
  toggle: {
    minWidth: a11y.minTouchTarget,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
  },
  togglePressed: { opacity: 0.6 },
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
