import { useEffect, useImperativeHandle, useRef } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';
import { AppText } from './AppText';
import { announce } from './LiveMessage';
import { focusOn } from '../hooks/useAccessibilityFocus';
import { useHighContrast } from '../hooks/usePreferences';
import { colors, spacing, radius, typography, a11y } from '../theme';

/**
 * A date, entered as three labelled fields: Day, Month, Year.
 *
 * ## Why not a date picker
 *
 * The obvious choice is `@react-native-community/datetimepicker`. Under a screen reader it is
 * a poor one: iOS renders a multi-column wheel that VoiceOver navigates one column at a time
 * with no way to type, and TalkBack's calendar grid means swiping through weeks to reach a
 * birth year forty years ago. Both are slow for a sighted user and genuinely hostile for a
 * blind one — a date of birth is the worst possible case for a picker, because the target is
 * always far from today.
 *
 * Three number fields is the pattern GOV.UK settled on for exactly this reason, after
 * testing with assistive-tech users. You can type it, you can check what you typed field by
 * field, and it needs no native module — which also keeps it working in Expo Go.
 *
 * ## What makes it accessible rather than just three boxes
 *
 * - Each field has its own visible label and its own accessible name that includes the group:
 *   "Date of birth, day", not a bare "day" that could belong to anything on the screen.
 * - The group has a heading-like legend, and the expected format is stated as text — not left
 *   to a placeholder that vanishes when you type.
 * - **No auto-advance.** Jumping focus after two digits is the same bug as the six-box OTP
 *   field: it interrupts the reader mid-word and moves the cursor out from under someone who
 *   was still checking their entry.
 * - A four-digit year, never two. "Enter your year of birth" with a two-digit box forces a
 *   guess about the century that is wrong for exactly the users a blood service cares about.
 *
 * The value is exchanged as `YYYY-MM-DD` — what the backend's `isoDate` schema parses — or
 * `null` when the date is empty or incomplete.
 */

/** Splits `YYYY-MM-DD` into the three field values. Anything unparseable becomes empty. */
function partsOf(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return { year: '', month: '', day: '' };
  return { year: match[1], month: String(Number(match[2])), day: String(Number(match[3])) };
}

/** Rebuilds `YYYY-MM-DD`, or null while the date is incomplete or impossible. */
function joinParts({ day, month, year }) {
  if (!day || !month || !year) return null;
  if (year.length !== 4) return null;

  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (!d || !m || !y || m > 12 || d > 31) return null;

  // Rejects 31 February and friends: the round-trip only survives a real calendar date.
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null;
  }

  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function AppDateInput({
  label,
  /** `YYYY-MM-DD` or null. */
  value,
  /** Called with `YYYY-MM-DD`, or null while the entry is incomplete. */
  onChange,
  error,
  helperText,
  required = false,
  disabled = false,
  /** Spoken guidance, e.g. "For example, 15 3 1990". */
  formatHint = 'For example, 15 3 1990.',
  containerStyle,
  ref,
}) {
  const parts = partsOf(value);
  const dayRef = useRef(null);
  const lastError = useRef(null);
  const contrast = useHighContrast();

  // The error announces itself through the live region on Android; iOS needs the call.
  useEffect(() => {
    if (!error) {
      lastError.current = null;
      return;
    }
    if (lastError.current === error) return;
    lastError.current = error;
    if (Platform.OS !== 'android') announce(`Error. ${label}. ${error}`);
  }, [error, label]);

  // Focusing the group means focusing its first field, so "jump to the first invalid field"
  // works the same way here as on every other control.
  useImperativeHandle(ref, () => ({
    focus: () => dayRef.current?.focus(),
    focusForAccessibility: () => focusOn(dayRef),
    focusAll: () => {
      focusOn(dayRef);
      dayRef.current?.focus();
    },
  }));

  function update(field, raw) {
    const digits = raw.replace(/\D/g, '').slice(0, field === 'year' ? 4 : 2);
    onChange?.(joinParts({ ...parts, [field]: digits }), { ...parts, [field]: digits });
  }

  const field = (name, fieldLabel, width, inputRef) => (
    // `flexBasis`, not `width`. A fixed 104pt year box holds four digits at the default text
    // size and clips the last one somewhere around 160% — the classic font-scaling failure,
    // and invisible to anyone testing at default size. Here the boxes keep their relative
    // proportions, grow with the text, and the row wraps to two lines before anything clips.
    <View style={[styles.field, { flexBasis: width, flexGrow: 1, flexShrink: 1 }]}>
      <AppText variant="caption" color={disabled ? colors.textDisabled : colors.text}>
        {fieldLabel}
      </AppText>
      <TextInput
        ref={inputRef}
        value={parts[name]}
        onChangeText={(text) => update(name, text)}
        editable={!disabled}
        keyboardType="number-pad"
        inputMode="numeric"
        maxLength={name === 'year' ? 4 : 2}
        // The group's name is folded into each field, so the reader says "Date of birth,
        // day" rather than a bare "day" that belongs to nothing.
        accessibilityLabel={`${label}, ${fieldLabel.toLowerCase()}`}
        accessibilityHint={name === 'day' ? formatHint : undefined}
        accessibilityState={{ disabled }}
        maxFontSizeMultiplier={a11y.maxFontSizeMultiplier}
        style={[
          styles.input,
          contrast.on && { borderColor: contrast.border(colors.border), borderWidth: contrast.width(1) },
          error && styles.inputError,
          disabled && styles.inputDisabled,
        ]}
      />
    </View>
  );

  return (
    <View style={[styles.container, containerStyle]}>
      <AppText variant="label" color={disabled ? colors.textDisabled : colors.text}>
        {label}
        {required ? (
          // The word, not an asterisk — "*" is read as "star" or skipped entirely.
          <AppText variant="label" color={colors.error}>
            {' '}
            (required)
          </AppText>
        ) : null}
      </AppText>

      <AppText variant="caption" color={colors.textMuted} style={styles.format}>
        {formatHint}
      </AppText>

      <View style={styles.row}>
        {field('day', 'Day', 72, dayRef)}
        {field('month', 'Month', 82)}
        {field('year', 'Year', 104)}
      </View>

      <View accessibilityLiveRegion="polite">
        {error ? (
          <AppText variant="caption" color={colors.error} style={styles.message}>
            Error: {error}
          </AppText>
        ) : helperText ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.message}>
            {helperText}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  format: { marginTop: spacing.xs },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm, flexWrap: 'wrap' },
  field: { gap: spacing.xs },
  input: {
    ...typography.body,
    color: colors.text,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: a11y.minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  inputError: { borderColor: colors.error, borderWidth: 2 },
  inputDisabled: { color: colors.textDisabled, borderColor: colors.borderDisabled },
  message: { marginTop: spacing.sm },
});

export default AppDateInput;
