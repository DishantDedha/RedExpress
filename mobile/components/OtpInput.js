import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from './AppText';
import { announce } from './LiveMessage';
import { focusOn } from '../hooks/useAccessibilityFocus';
import { useHighContrast } from '../hooks/usePreferences';
import { colors, spacing, radius, typography, a11y } from '../theme';

/**
 * The verification-code field: six boxes to look at, one text field underneath.
 *
 * ## The trap this component exists to avoid
 *
 * The obvious way to build the mockup is six one-character `TextInput`s that auto-advance.
 * It looks right and it is close to unusable without sight:
 *
 *   - a screen reader announces six anonymous "edit text" fields, none of which says what
 *     the group is for;
 *   - focus jumps to the next box on every keystroke, cutting the reader off mid-word, six
 *     times in a row;
 *   - SMS autofill hands the whole code to the *first* field, which keeps one digit and
 *     discards the rest — so the one feature that makes an OTP bearable stops working;
 *   - checking what you typed means visiting six fields to collect six digits;
 *   - backspace behaviour across boxes is a well-known source of stuck focus.
 *
 * So there is exactly one `TextInput`. It carries the whole code, it is labelled
 * "Verification code", and it declares `textContentType="oneTimeCode"` (iOS) and
 * `autoComplete="sms-otp"` (Android) so the platform can fill it from the message. The six
 * boxes are `View`s drawn behind it and hidden from the accessibility tree entirely — they
 * are a picture of the value, not the value.
 *
 * ## How the input can be invisible without being hidden
 *
 * The input is stretched over the boxes with `color: 'transparent'` and no caret, so the
 * digits you see are the ones painted in the boxes. It is *not* given `opacity: 0`, which is
 * the tempting alternative: UIKit drops any view with an alpha of 0 from the accessibility
 * tree, so VoiceOver would find no field at all. Transparent glyphs, opaque view.
 *
 * ## What it announces
 *
 * `accessibilityValue.text` is the digits separated by spaces. Without that, "4071" is read
 * as "four thousand and seventy-one", which is useless for checking a code.
 */

export const OtpInput = forwardRef(function OtpInput(
  {
    value = '',
    onChangeText,
    length = 6,
    label = 'Verification code',
    error,
    /** Called with the code once all `length` digits are present. */
    onComplete,
    autoFocus = false,
    editable = true,
    tone = 'default',
    accessibilityHint,
    containerStyle,
  },
  ref,
) {
  const inputRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const lastError = useRef(null);
  const completedFor = useRef(null);
  const contrast = useHighContrast();

  const brand = tone === 'brand';
  const digits = value.split('');
  // Where the next digit will land — highlighted so a sighted user can see their place.
  const activeIndex = Math.min(value.length, length - 1);

  useImperativeHandle(ref, () => ({
    focus: () => inputRef.current?.focus(),
    blur: () => inputRef.current?.blur(),
    clear: () => onChangeText?.(''),
    focusForAccessibility: () => focusOn(inputRef),
    focusAll: () => {
      focusOn(inputRef);
      inputRef.current?.focus();
    },
  }));

  // Announce an error when it appears. Android's live region on the message below already
  // does this natively, so only iOS needs the explicit call — doing both means TalkBack says
  // it twice.
  useEffect(() => {
    if (!error) {
      lastError.current = null;
      return;
    }
    if (lastError.current === error) return;
    lastError.current = error;
    if (Platform.OS !== 'android') announce(`Error. ${error}`);
  }, [error]);

  // Fire `onComplete` once per distinct full code. Guarding on the value stops a re-render
  // from resubmitting a code the server has already rejected.
  useEffect(() => {
    if (value.length !== length) {
      completedFor.current = null;
      return;
    }
    if (completedFor.current === value) return;
    completedFor.current = value;
    onComplete?.(value);
  }, [value, length, onComplete]);

  function handleChange(text) {
    // Autofill can deliver the code with spaces or a stray letter attached, and some
    // keyboards send a non-breaking space. Keep the digits, drop everything else.
    const cleaned = text.replace(/\D/g, '').slice(0, length);
    onChangeText?.(cleaned);
  }

  const composedLabel = [label, error ? `Error: ${error}` : null].filter(Boolean).join(', ');

  const spokenValue = value.length
    ? // Spaced so each digit is read as a digit rather than the whole thing as one number.
      value.split('').join(' ')
    : 'Empty';

  const boxBorder = (index) => {
    if (error) return colors.error;
    if (focused && index === activeIndex) return brand ? colors.onPrimary : colors.focusRing;
    // The brand surface is left alone: on deep red, white is already the highest-contrast
    // edge available, and near-black would be a step backwards.
    if (digits[index]) return brand ? colors.onPrimary : contrast.border(colors.border);
    return brand ? colors.onBrandMuted : contrast.border(colors.border);
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {/*
        A visible label, for the same reason every other field in this app has one: the
        heading above says "Verify phone number", which is the screen's name, not the
        field's. Without this the boxes are unlabelled to everyone, not just to a reader.
      */}
      <AppText variant="label" color={brand ? colors.onPrimary : colors.text} style={styles.label}>
        {label}
      </AppText>

      <View style={styles.stack}>
        {/* The picture of the value. Not interactive, not in the accessibility tree. */}
        <View
          style={styles.boxes}
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          {Array.from({ length }).map((_, index) => (
            <View
              key={index}
              style={[
                styles.box,
                {
                  borderColor: boxBorder(index),
                  borderWidth: focused && index === activeIndex ? 3 : 2,
                },
              ]}
            >
              <AppText variant="title" color={colors.text}>
                {digits[index] ?? ''}
              </AppText>
            </View>
          ))}
        </View>

        <TextInput
          ref={inputRef}
          value={value}
          onChangeText={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          editable={editable}
          autoFocus={autoFocus}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={length}
          // The two halves of SMS autofill. iOS surfaces the code above the keyboard;
          // Android offers it from the notification. Either way the field receives all six
          // digits at once, which is exactly what a single input can accept and six cannot.
          textContentType="oneTimeCode"
          autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
          importantForAutofill="yes"
          // Invisible text, invisible caret — the boxes behind are doing the drawing.
          caretHidden
          selectionColor="transparent"
          accessibilityLabel={composedLabel}
          accessibilityValue={{ text: spokenValue }}
          accessibilityHint={
            accessibilityHint ??
            `Enter the ${length} digit code from the text message. It may fill in automatically.`
          }
          accessibilityState={{ disabled: !editable }}
          maxFontSizeMultiplier={a11y.maxFontSizeMultiplier}
          style={styles.input}
        />
      </View>

      {/* Always mounted: TalkBack only reports changes to a live region it was already
          watching, so a region that appears along with the error arrives too late. */}
      <View accessibilityLiveRegion="polite">
        {error ? (
          <AppText
            variant="caption"
            color={colors.error}
            style={[styles.message, brand && styles.messageChip]}
          >
            Error: {error}
          </AppText>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.sm },
  stack: { position: 'relative' },
  boxes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  box: {
    flex: 1,
    // Comfortably past the 48dp minimum: the whole row is one touch target, but a code box
    // that is smaller than a fingertip looks wrong even when it is not the thing being hit.
    minHeight: a11y.largeTouchTarget,
    maxWidth: 64,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  input: {
    ...StyleSheet.absoluteFillObject,
    ...typography.title,
    // Transparent glyphs, but a fully opaque view — see the note at the top of the file.
    color: 'transparent',
    textAlign: 'center',
    // Android draws a default underline on a bare TextInput.
    ...Platform.select({ android: { textDecorationLine: 'none' } }),
  },
  message: { marginTop: spacing.sm },
  messageChip: {
    backgroundColor: colors.errorTint,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    alignSelf: 'flex-start',
  },
});

export default OtpInput;
