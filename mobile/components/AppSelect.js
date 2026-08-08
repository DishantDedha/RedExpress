import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { announce } from './LiveMessage';
import { focusOn } from '../hooks/useAccessibilityFocus';
import { useHighContrast } from '../hooks/usePreferences';
import { hapticSelection } from '../services/feedback';
import { colors, spacing, radius, a11y } from '../theme';

/**
 * A dropdown: blood group, gender, state, district, city.
 *
 * React Native has no accessible native picker that works the same on both platforms, and
 * the community pickers are worse — the iOS wheel is close to unusable under VoiceOver.
 * So this is built from a trigger and a modal list, which lets the accessibility semantics
 * be stated explicitly:
 *
 *   trigger   `accessibilityRole="combobox"`, with `accessibilityValue.text` set to the
 *             chosen option and `accessibilityState.expanded` tracking the modal. A reader
 *             announces "Blood group, combo box, O positive" — name, type, current value —
 *             which is the whole point.
 *
 *   options   `accessibilityRole="radio"` with `accessibilityState.checked`, inside a
 *             `radiogroup`. The obvious alternative, `menuitem`, cannot express "this one is
 *             already selected", so a user returning to the list has no way to hear what
 *             they picked last time.
 *
 *   position  Each option's `accessibilityHint` carries "item 4 of 8". In a list of 30
 *             districts a screen-reader user otherwise has no sense of how far through they
 *             are, and no way to know whether swiping again will wrap or stop.
 *
 * The modal moves focus to its own heading on open and returns focus to the trigger on
 * close, so the reader cursor never ends up stranded behind a dismissed overlay.
 */

export const AppSelect = forwardRef(function AppSelect(
  {
    label,
    /** [{ value, label, description? }] */
    options = [],
    value,
    onChange,
    placeholder = 'Select an option',
    error,
    helperText,
    required = false,
    disabled = false,
    accessibilityLabel,
    accessibilityHint,
    containerStyle,
  },
  ref,
) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const modalHeadingRef = useRef(null);
  const lastError = useRef(null);
  const contrast = useHighContrast();

  const selected = options.find((option) => option.value === value) ?? null;
  const displayText = selected?.label ?? placeholder;

  useImperativeHandle(ref, () => ({
    open: () => setOpen(true),
    close: () => setOpen(false),
    focusForAccessibility: () => focusOn(triggerRef),
    focusAll: () => focusOn(triggerRef),
  }));

  // Same contract as AppTextInput: an error is spoken when it appears, and iOS needs the
  // explicit call because it ignores accessibilityLiveRegion.
  useEffect(() => {
    if (!error) {
      lastError.current = null;
      return;
    }
    if (lastError.current === error) return;
    lastError.current = error;
    if (Platform.OS !== 'android') announce(`Error. ${label}. ${error}`);
  }, [error, label]);

  // Move the reader into the modal once it has actually rendered, otherwise the cursor stays
  // on the trigger underneath and the user is operating an invisible screen.
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(() => focusOn(modalHeadingRef), a11y.focusDelayMs);
    return () => clearTimeout(timer);
  }, [open]);

  function close({ restoreFocus = true } = {}) {
    setOpen(false);
    // Send the cursor back where it came from. Without this the reader restarts at the top
    // of the screen and the user has to find their place in the form again.
    if (restoreFocus) setTimeout(() => focusOn(triggerRef), a11y.focusDelayMs);
  }

  function select(option) {
    hapticSelection();
    onChange?.(option.value);
    close();
    // The trigger's value changed while the reader's attention was in the modal, so say what
    // was chosen rather than relying on the user to go back and check.
    announce(`${label}, ${option.label} selected`);
  }

  const borderColor = disabled
    ? colors.borderDisabled
    : error
      ? colors.error
      : open
        ? colors.focusRing
        : contrast.border(colors.border);

  const borderWidth = open || error ? contrast.focusWidth(2) : contrast.width(1);

  return (
    <View style={[styles.container, containerStyle]}>
      <AppText variant="label" style={styles.label} color={disabled ? colors.textDisabled : colors.text}>
        {label}
        {required ? (
          <AppText variant="label" color={colors.error}>
            {' '}
            (required)
          </AppText>
        ) : null}
      </AppText>

      <Pressable
        ref={triggerRef}
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="combobox"
        accessibilityLabel={[accessibilityLabel ?? label, required ? 'required' : null, error ? `Error: ${error}` : null]
          .filter(Boolean)
          .join(', ')}
        // Spoken as the field's current value, distinct from its name.
        accessibilityValue={{ text: selected ? selected.label : 'No selection' }}
        accessibilityHint={accessibilityHint ?? 'Opens a list of options'}
        accessibilityState={{ disabled, expanded: open }}
        style={({ pressed }) => [
          styles.trigger,
          { borderColor, borderWidth },
          pressed && !disabled && styles.triggerPressed,
          disabled && styles.triggerDisabled,
        ]}
      >
        <AppText
          variant="body"
          // A chosen value and an empty field must not look alike. The muted colour is a
          // supplement — the reader hears "No selection" from accessibilityValue.
          color={disabled ? colors.textDisabled : selected ? colors.text : colors.textMuted}
          style={styles.triggerText}
        >
          {displayText}
        </AppText>
        {/* Decorative chevron. Hidden from the tree — the combobox role already says the
            control opens something, so reading "down pointing triangle" is pure noise. */}
        <AppText
          variant="body"
          color={disabled ? colors.textDisabled : colors.textMuted}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          ▾
        </AppText>
      </Pressable>

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

      <Modal
        visible={open}
        animationType="slide"
        transparent
        // Android hardware back and the iOS swipe gesture both land here.
        onRequestClose={() => close()}
        // Hides everything behind the modal from the reader, so swiping past the last option
        // does not wander into the form underneath.
        accessibilityViewIsModal
        supportedOrientations={['portrait', 'landscape']}
      >
        <View style={styles.backdrop}>
          {/* Tapping outside closes, as expected. Hidden from the reader: it is an escape
              hatch for pointer users, and the labelled Cancel button below is the
              discoverable equivalent. */}
          <Pressable
            style={styles.backdropTouchable}
            onPress={() => close()}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />

          <View style={styles.sheet}>
            <AppText ref={modalHeadingRef} variant="heading" style={styles.sheetTitle} accessibilityRole="header">
              {label}
            </AppText>
            <AppText variant="caption" color={colors.textMuted} style={styles.sheetCount}>
              {options.length} {options.length === 1 ? 'option' : 'options'}
            </AppText>

            <FlatList
              data={options}
              keyExtractor={(option) => String(option.value)}
              accessibilityRole="radiogroup"
              style={styles.list}
              // Long lists of districts need to be reachable at 200% text size.
              keyboardShouldPersistTaps="handled"
              renderItem={({ item, index }) => {
                const checked = item.value === value;
                return (
                  <Pressable
                    onPress={() => select(item)}
                    accessibilityRole="radio"
                    accessibilityLabel={item.description ? `${item.label}, ${item.description}` : item.label}
                    accessibilityHint={`Item ${index + 1} of ${options.length}`}
                    accessibilityState={{ checked, selected: checked }}
                    style={({ pressed }) => [
                      styles.option,
                      // A hairline divider is close to invisible with reduced contrast
                      // sensitivity, and in a list of thirty districts the divider is what
                      // tells you where one option ends and the next begins.
                      contrast.on && {
                        borderBottomWidth: 1,
                        borderBottomColor: contrast.borderMuted(colors.borderMuted),
                      },
                      pressed && styles.optionPressed,
                    ]}
                  >
                    <View style={styles.optionTextWrap}>
                      <AppText variant={checked ? 'bodyStrong' : 'body'}>{item.label}</AppText>
                      {item.description ? (
                        <AppText variant="caption" color={colors.textMuted}>
                          {item.description}
                        </AppText>
                      ) : null}
                    </View>
                    {/*
                      The tick is redundant for a screen reader (accessibilityState.checked
                      already said so) but essential for everyone else: without it, selection
                      would be carried by font weight alone, which is not a reliable signal.
                    */}
                    {checked ? (
                      <AppText
                        variant="bodyStrong"
                        color={colors.primary}
                        accessibilityElementsHidden
                        importantForAccessibility="no-hide-descendants"
                      >
                        ✓
                      </AppText>
                    ) : null}
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <AppText variant="body" color={colors.textMuted} style={styles.empty}>
                  No options available yet.
                </AppText>
              }
            />

            <AppButton
              title="Cancel"
              variant="secondary"
              onPress={() => close()}
              accessibilityHint={`Closes the ${label} list without changing your selection`}
              style={styles.cancel}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
});

const styles = StyleSheet.create({
  container: { marginBottom: spacing.lg },
  label: { marginBottom: spacing.xs },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderRadius: radius.md,
    minHeight: a11y.minTouchTarget,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  triggerPressed: { backgroundColor: colors.primaryTint },
  triggerDisabled: { backgroundColor: colors.background },
  triggerText: { flexShrink: 1, marginRight: spacing.sm },
  message: { marginTop: spacing.xs },

  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdropTouchable: { flex: 1 },
  sheet: {
    backgroundColor: colors.card,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    paddingTop: spacing.xl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    // Capped so the sheet cannot cover the whole screen, leaving the backdrop visible as a
    // cue that this is a temporary layer.
    maxHeight: '80%',
  },
  sheetTitle: { marginBottom: spacing.xs },
  sheetCount: { marginBottom: spacing.md },
  list: { flexGrow: 0 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: a11y.minTouchTarget,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderMuted,
  },
  optionPressed: { backgroundColor: colors.primaryTint },
  optionTextWrap: { flexShrink: 1, marginRight: spacing.sm },
  empty: { paddingVertical: spacing.xl, textAlign: 'center' },
  cancel: { marginTop: spacing.lg },
});

export default AppSelect;
