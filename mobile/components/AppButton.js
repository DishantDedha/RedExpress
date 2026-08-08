import { forwardRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useHighContrast } from '../hooks/usePreferences';
import { hapticTap } from '../services/feedback';
import { colors, spacing, radius, a11y, highContrast } from '../theme';

/**
 * The only button in the app.
 *
 * Screens never reach for a bare `Pressable`, because the guarantees below have to hold
 * everywhere and a hand-rolled button is where they get forgotten:
 *
 *   role         `accessibilityRole="button"`, always. Without it a reader announces the
 *                label as plain text and gives no hint that it can be activated.
 *   label        The visible text by default; `accessibilityLabel` overrides it when the
 *                visible text is not self-describing out of context ("Next" → "Next, go to
 *                verification").
 *   state        `disabled` and `busy` are exposed through `accessibilityState`, so a reader
 *                says "dimmed" / "busy" instead of the user tapping a dead control and
 *                getting silence.
 *   target       48dp minimum height, and `hitSlop` fills any remaining gap so the *touch*
 *                target meets the minimum even where the visual one is deliberately smaller
 *                (a "Resend" link). WCAG 2.5.5 / Android's own guidance.
 *   scaling      The label is `AppText`, so it grows with the OS font setting. The button is
 *                sized by `minHeight` and padding rather than a fixed `height`, so it grows
 *                with the label instead of clipping it.
 *
 * ## Pressed and disabled are not signalled by colour alone
 *
 * Pressed darkens the fill *and* is reported by the platform through the pressed state.
 * Disabled dims the fill *and* sets `accessibilityState.disabled`. A `loading` button shows a
 * spinner *and* keeps its label *and* reports `busy` — the spinner alone would be invisible
 * to a screen reader and ambiguous to everyone else.
 *
 * ## The high-contrast preference (Phase 11)
 *
 * When it is on, a button does three things differently:
 *
 *   - the primary fill darkens from #B00020 (7.33:1) to #8C0019 (9.86:1), clearing AAA;
 *   - *every* variant gains a near-black outline, including the filled ones. A filled button
 *     with no border relies on the fill itself being distinguishable from the page, which is
 *     exactly the perception that reduced contrast sensitivity takes away. The outline gives
 *     the control a hard edge at 17:1 regardless of what is inside it;
 *   - the default minimum height goes from 48dp to 56dp, so primary actions are physically
 *     larger for anyone with a tremor or reduced fine motor control — the population that
 *     overlaps most heavily with low vision.
 *
 * The brand variants are excluded from the outline: they sit on deep red, where near-black is
 * a lower-contrast edge than the white border they already have.
 */

const VARIANTS = {
  primary: {
    bg: colors.primary,
    bgPressed: colors.primaryPressed,
    fg: colors.onPrimary,
    border: 'transparent',
  },
  // The "less prominent" action. Outlined rather than grey-on-grey, so it is still clearly
  // a control at 3:1 against the surface.
  secondary: {
    bg: colors.card,
    bgPressed: colors.primaryTint,
    fg: colors.primary,
    border: colors.primary,
  },
  // Destructive actions. Note this is the *same* red as primary — the difference is carried
  // by the label ("Delete account"), never by hue.
  danger: {
    bg: colors.error,
    bgPressed: colors.primaryPressed,
    fg: colors.white,
    border: 'transparent',
  },
  // Inline text action: "Resend code", "Skip for now".
  link: {
    bg: 'transparent',
    bgPressed: colors.primaryTint,
    fg: colors.primary,
    border: 'transparent',
  },

  /**
   * The primary action on a full-bleed red screen (the Phase 8 sign-in flow).
   *
   * The mockups draw this button as a slightly darker red on the red background. That does
   * not survive an accessibility check: #8C0019 against #B00020 is 1.34:1, so the button's
   * *edge* — the thing you have to see to know a control is there at all — fails WCAG 1.4.11
   * (3:1 for non-text UI). Anyone with reduced contrast sensitivity sees a red rectangle
   * with floating white words in it.
   *
   * So it inverts instead: a white fill carrying the red label at 7.33:1, which is also how
   * the landing screen's own buttons are drawn in mockup 1. Same shape, same position, same
   * weight in the hierarchy — legible.
   */
  brand: {
    bg: colors.white,
    bgPressed: colors.primaryTint,
    fg: colors.primary,
    border: colors.white,
    fgDisabled: colors.textDisabled,
  },

  // The secondary action on a red screen: outlined in white, white label. The 2px white
  // border is 7.33:1 against the background, so the control's boundary is unambiguous.
  brandOutline: {
    bg: 'transparent',
    bgPressed: colors.brandPressed,
    fg: colors.white,
    border: colors.white,
    // The light-surface disabled grey is invisible on red; dim towards the muted pink
    // instead, which still reads at 5.35:1 before the opacity knock-down.
    fgDisabled: colors.onBrandMuted,
    borderDisabled: colors.onBrandMuted,
  },
};

export const AppButton = forwardRef(function AppButton(
  {
    title,
    onPress,
    variant = 'primary',
    size = 'default',
    loading = false,
    disabled = false,
    fullWidth = true,
    haptic = true,
    accessibilityLabel,
    accessibilityHint,
    /** Announced instead of the label while loading, e.g. "Sending code". */
    loadingLabel,
    style,
    textStyle,
    children,
    ...rest
  },
  ref,
) {
  const contrast = useHighContrast();

  const base = VARIANTS[variant] ?? VARIANTS.primary;
  const label = title ?? children;

  // A loading button is not tappable. Disabling it is what stops a double-submit sending two
  // OTPs, and it is also honest: `busy` tells the reader why nothing is happening.
  const inert = disabled || loading;

  const onBrandSurface = variant === 'brand' || variant === 'brandOutline';
  const tone =
    contrast.on && !onBrandSurface
      ? {
          ...base,
          // Filled variants keep their hue and gain contrast; outlined ones keep their fill
          // and gain a hard edge. Either way the result is a shape with a 17:1 boundary.
          bg: base.bg === colors.primary ? highContrast.primary : base.bg,
          bgPressed: base.bgPressed === colors.primaryPressed ? colors.primary : base.bgPressed,
          fg: base.fg === colors.primary ? highContrast.primary : base.fg,
          border: highContrast.border,
        }
      : base;

  const minHeight =
    size === 'large' || (contrast.on && size !== 'small')
      ? a11y.largeTouchTarget
      : a11y.minTouchTarget;

  function handlePress(event) {
    if (inert) return;
    if (haptic) hapticTap();
    onPress?.(event);
  }

  return (
    <Pressable
      ref={ref}
      onPress={handlePress}
      disabled={inert}
      accessibilityRole="button"
      accessibilityLabel={loading ? (loadingLabel ?? accessibilityLabel ?? label) : (accessibilityLabel ?? label)}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inert, busy: loading }}
      // Guarantees the 48dp touch target for small variants (link buttons) without forcing
      // them to be visually chunky.
      hitSlop={size === 'small' ? spacing.md : 0}
      style={({ pressed }) => [
        styles.base,
        {
          minHeight,
          backgroundColor: pressed && !inert ? tone.bgPressed : tone.bg,
          borderColor:
            inert && tone.border !== 'transparent'
              ? (tone.borderDisabled ?? colors.borderDisabled)
              : tone.border,
        },
        variant === 'link' && styles.link,
        fullWidth ? styles.fullWidth : styles.auto,
        // Dimming is a *supplement* to accessibilityState.disabled, never the only signal.
        inert && styles.inert,
        style,
      ]}
      {...rest}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            size="small"
            color={tone.fg}
            // The label beside it already says what is happening, and `busy` is on the
            // button — the spinner itself is decoration and must not be stopped on.
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={styles.spinner}
          />
        ) : null}
        <AppText
          variant="button"
          color={inert ? (tone.fgDisabled ?? colors.textDisabled) : tone.fg}
          align="center"
          style={[styles.label, textStyle]}
        >
          {loading && loadingLabel ? loadingLabel : label}
        </AppText>
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.md,
    borderWidth: 2,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
    borderWidth: 0,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  fullWidth: { alignSelf: 'stretch' },
  auto: { alignSelf: 'flex-start' },
  inert: { opacity: 0.6 },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Lets the label wrap onto a second line at large font sizes rather than being clipped.
    flexShrink: 1,
  },
  spinner: { marginRight: spacing.sm },
  label: { flexShrink: 1 },
});

export default AppButton;
