import { forwardRef } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
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
 * ## The shape is GMP's
 *
 * An 8px radius and a 1px edge, not 10px and 2px. That sounds like nothing and is most of the
 * difference between a button that looks drawn and one that looks placed — GMP's CTAs are
 * crisp rectangles, and a 2px border at a 10px radius reads as a sticker.
 *
 * `shape="pill"` is the other form that app uses: a fully rounded button with a short
 * all-caps label, as on its catalogue cards. Here it is for the compact actions inside a card
 * — "CALL", "I CAN DONATE" — where a full-width rectangle would outweigh the card holding it.
 *
 * ## Pressed and disabled are not signalled by colour alone
 *
 * Pressed darkens the fill *and* is reported by the platform through the pressed state.
 * Disabled dims the fill *and* sets `accessibilityState.disabled`. A `loading` button shows a
 * spinner *and* keeps its label *and* reports `busy` — the spinner alone would be invisible
 * to a screen reader and ambiguous to everyone else.
 *
 * Note `fgPressed`. Every variant whose pressed state is a *blush* fill also changes its
 * label, because the brand red on its own 50 tint is 4.27:1 — under AA. Pressing a secondary
 * button swaps the label to the 800, which is 7.36:1 there. Without that pair the one moment
 * the user is actually touching the control is the one moment its label is not quite legible.
 *
 * ## The high-contrast preference
 *
 * When it is on, a button does three things differently:
 *
 *   - the primary fill darkens from #E02826 (4.67:1) to #A01918 (7.93:1), clearing AAA;
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
    fgPressed: colors.primaryOnTint,
    border: colors.primary,
  },
  /**
   * A quiet action that is not a brand statement: "Cancel" beside a Save, "Edit" on a card.
   * GMP's `secondary` — a neutral fill with a neutral edge — which this app had no equivalent
   * of, so every lesser action had to be an outlined red one and the screens ended up with
   * three or four red outlines competing on them.
   */
  neutral: {
    bg: colors.card,
    bgPressed: colors.surface,
    fg: colors.text,
    border: colors.border,
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
    fgPressed: colors.primaryOnTint,
    border: 'transparent',
  },

  /**
   * The primary action on a full-bleed red screen (the sign-in flow).
   *
   * The mockups draw this button as a slightly darker red on the red background. That does
   * not survive an accessibility check: the 800 against the 700 is 1.33:1, so the button's
   * *edge* — the thing you have to see to know a control is there at all — fails WCAG 1.4.11
   * (3:1 for non-text UI). Anyone with reduced contrast sensitivity sees a red rectangle
   * with floating white words in it.
   *
   * So it inverts instead: a white fill carrying the red label at 4.67:1, which is also how
   * the landing screen's own buttons are drawn in mockup 1. Same shape, same position, same
   * weight in the hierarchy — legible.
   */
  brand: {
    bg: colors.white,
    bgPressed: colors.primaryTint,
    fg: colors.primary,
    fgPressed: colors.primaryOnTint,
    border: colors.white,
    fgDisabled: colors.textDisabled,
  },

  // The secondary action on a red screen: outlined in white, white label. The white border is
  // 5.98:1 against the band, so the control's boundary is unambiguous.
  brandOutline: {
    bg: 'transparent',
    bgPressed: colors.brandPressed,
    fg: colors.white,
    border: colors.white,
    // The light-surface disabled grey is invisible on red; dim towards the muted pink
    // instead, which still reads at 4.93:1 before the opacity knock-down.
    fgDisabled: colors.onBrandMuted,
    borderDisabled: colors.onBrandMuted,
  },
};

export const AppButton = forwardRef(function AppButton(
  {
    title,
    onPress,
    variant = 'primary',
    /**
     * 'default' (48) · 'large' (56, a screen's primary action) · 'compact' (40, GMP's in-card
     * action) · 'small' (36, an inline text action). Every one under 48 makes the touch target
     * up in hitSlop.
     */
    size = 'default',
    /** 'rounded' — GMP's 8px CTA. 'pill' — the all-caps action on a card. */
    shape = 'rounded',
    /**
     * Set the label in capitals. On by default for the pill, which is GMP's all-caps card
     * CTA, and worth turning off when the label is a name — "CALL RAVI KUMAR" is shouting at
     * the one screen where nobody is in the mood for it.
     */
    uppercase,
    /** A decorative glyph before the label. A name from `Icon`; the label carries the meaning. */
    icon,
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
  const pill = shape === 'pill';

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
          fgPressed: base.fgPressed === colors.primaryOnTint ? highContrast.primary : base.fgPressed,
          border: highContrast.border,
        }
      : base;

  /**
   * Heights, and why three of the four are under 48.
   *
   * GMP's in-card actions are 40 tall ("Pay Now", "View Details", "Cancel Order"), and a row of
   * 48dp slabs inside a list row is what made this app's cards look like they were made of
   * buttons. So `compact` is 40 and `small` is 36, and both make the touch target up in
   * `hitSlop` below — the *visual* control is smaller, the thing a finger has to hit is not.
   *
   * High contrast overrides all of it except `small`: someone who turned that on gets the
   * larger target, because the population it serves overlaps most heavily with reduced fine
   * motor control.
   */
  const minHeight =
    size === 'large' || (contrast.on && size !== 'small')
      ? a11y.largeTouchTarget
      : size === 'small'
        ? spacing.xxl + spacing.xs // 36
        : size === 'compact'
          ? spacing.xxl + spacing.sm // 40 — GMP's h-10
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
      // Guarantees the 48dp touch target for the small variants without forcing them to be
      // visually chunky.
      hitSlop={size === 'small' ? spacing.md : size === 'compact' ? spacing.xs : 0}
      style={({ pressed }) => [
        styles.base,
        pill ? styles.pill : styles.rounded,
        (size === 'small' || size === 'compact') && styles.small,
        {
          minHeight,
          backgroundColor: pressed && !inert ? tone.bgPressed : tone.bg,
          borderColor:
            inert && tone.border !== 'transparent'
              ? (tone.borderDisabled ?? colors.borderDisabled)
              : tone.border,
          // A white outline on deep red is the control's only edge, so it keeps its 2px; on a
          // white surface GMP's 1px line is crisper and a 2px one reads as a sticker.
          borderWidth: contrast.width(onBrandSurface ? 2 : 1),
        },
        variant === 'link' && styles.link,
        fullWidth ? styles.fullWidth : styles.auto,
        // Dimming is a *supplement* to accessibilityState.disabled, never the only signal.
        inert && styles.inert,
        style,
      ]}
      {...rest}
    >
      {({ pressed }) => {
        const fg = inert
          ? (tone.fgDisabled ?? colors.textDisabled)
          : pressed && tone.fgPressed
            ? tone.fgPressed
            : tone.fg;

        // The pill form is all-caps, like GMP's card CTAs. Uppercasing is presentational only
        // — the accessible name on the Pressable above is the sentence-case label, because a
        // reader handed "I CAN DONATE" may spell it out.
        const shown = loading && loadingLabel ? loadingLabel : label;
        const caps = uppercase ?? pill;
        const text = caps && typeof shown === 'string' ? shown.toUpperCase() : shown;

        return (
          <View style={styles.content}>
            {loading ? (
              <ActivityIndicator
                size="small"
                color={fg}
                // The label beside it already says what is happening, and `busy` is on the
                // button — the spinner itself is decoration and must not be stopped on.
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.leading}
              />
            ) : icon ? (
              <Icon name={icon} size={pill ? 14 : 18} color={fg} style={styles.leading} />
            ) : null}

            <AppText
              variant={pill ? 'buttonSmall' : size === 'compact' ? 'label' : 'button'}
              weight={caps && !pill ? 'bold' : undefined}
              color={fg}
              align="center"
              style={[styles.label, textStyle]}
            >
              {text}
            </AppText>
          </View>
        );
      }}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rounded: { borderRadius: radius.md },
  pill: { borderRadius: radius.pill, paddingHorizontal: spacing.lg },
  small: { paddingVertical: spacing.sm, paddingHorizontal: spacing.lg },
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
  leading: { marginRight: spacing.sm },
  label: { flexShrink: 1 },
});

export default AppButton;
