import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useHighContrast } from '../hooks/usePreferences';
import { a11y, colors, spacing } from '../theme';

/**
 * One row of a list, drawn GMP's way: a white block laid edge to edge across a neutral page,
 * with an optional tinted status strip along its top.
 *
 * ## Why this is not a `Card`
 *
 * A `Card` is a rounded, bordered, shadowed panel inset from both edges. Stack eight of them
 * and you get eight floating objects with sixteen visible edges and a 16px channel of page
 * down each side — which is what the alerts and requests lists were, and why they read as
 * cluttered no matter what colour anything was.
 *
 * A row block has no radius, no side borders and no shadow. It is full-bleed white, and the
 * 8px of page showing above it is the only separator — so a list of ten is ten bands of white
 * with nine hairlines of grey, not ten objects. That single change is most of the difference
 * between this app's lists and GMP's.
 *
 * It is also why the screen holding them wants `page="muted"` and `padded={false}`: on a white
 * page the separator is invisible, and with padding the block is not full-bleed.
 *
 * ## The status strip
 *
 * `status` paints a tinted bar across the top of the block carrying an icon and a short label —
 * GMP's order card, which says "In Transit" before it says anything else. It is the fastest
 * thing on the row to read, and it is a *word* in a tint rather than a coloured dot, so it
 * survives greyscale and reaches a screen reader.
 *
 * The strip is hidden from the accessibility tree when the block is pressable, because the
 * block's own label already opens with the state — see the `accessibilityLabel` each caller
 * passes. Left reachable it would be a bare word ("Open") with nothing to say what it describes.
 *
 * ## Grouping
 *
 * Pressable, it is one button: role, label, hint, 48dp minimum. Not pressable, `grouped` makes
 * the whole block one focus stop announcing the caller's sentence instead of five fragments a
 * screen-reader user has to reassemble.
 *
 * Pass `accessibilityLabel` in either case. The auto-generated one concatenates the visible
 * text in render order, which is rarely a sentence.
 */

const STATUS_TONES = {
  neutral: { bg: colors.surface, fg: colors.textMuted, icon: 'list' },
  brand: { bg: colors.blushStrong, fg: colors.primaryOnTint, icon: 'drop' },
  // `Chip`'s name for the same thing, so a `tone` computed once in `services/requests.js` can
  // be handed to either component without a translation table in between.
  tint: { bg: colors.blushStrong, fg: colors.primaryOnTint, icon: 'drop' },
  success: { bg: colors.successTint, fg: colors.success, icon: 'check' },
  warning: { bg: colors.warningTint, fg: colors.warning, icon: 'bell' },
  error: { bg: colors.errorTint, fg: colors.error, icon: 'drop' },
};

export function RowBlock({
  children,
  /** `{ label, tone, icon }` — the tinted strip across the top. `tone` keys `STATUS_TONES`. */
  status,
  onPress,
  grouped = false,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  /** Trailing content on the strip's right — a timestamp, a count. */
  statusMeta,
  style,
  ...rest
}) {
  const contrast = useHighContrast();
  const palette = status ? (STATUS_TONES[status.tone] ?? STATUS_TONES.neutral) : null;

  const strip = status ? (
    <View
      // Decoration: every caller opens its own label with the state.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.strip,
        { backgroundColor: palette.bg },
        // A tint with no edge is exactly the distinction reduced contrast sensitivity removes,
        // at which point the strip is not a strip.
        contrast.on && { borderBottomWidth: 1, borderBottomColor: contrast.borderMuted(colors.borderMuted) },
      ]}
    >
      <Icon name={status.icon ?? palette.icon} size={13} color={palette.fg} />
      <AppText variant="footnote" weight="semibold" color={palette.fg} style={styles.stripLabel}>
        {status.label}
      </AppText>
      {statusMeta ? (
        <AppText variant="footnote" color={palette.fg} style={styles.stripMeta}>
          {statusMeta}
        </AppText>
      ) : null}
    </View>
  ) : null;

  const body = (
    <>
      {strip}
      <View style={styles.inner}>{children}</View>
    </>
  );

  // A block has no side borders, so under high contrast it needs a top and bottom line or it
  // merges with the page it is laid on.
  const edge = contrast.on && {
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: contrast.borderMuted(colors.borderMuted),
  };

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={accessibilityHint}
        accessibilityState={{ disabled }}
        style={({ pressed }) => [
          styles.block,
          edge,
          pressed && !disabled && styles.pressed,
          disabled && styles.disabled,
          style,
        ]}
        {...rest}
      >
        {body}
      </Pressable>
    );
  }

  return (
    <View
      // `accessible` collapses the subtree into one focus stop. Only when asked for.
      accessible={grouped}
      accessibilityLabel={grouped ? accessibilityLabel : undefined}
      accessibilityHint={grouped ? accessibilityHint : undefined}
      style={[styles.block, edge, style]}
      {...rest}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: colors.card,
    /**
     * The gap *is* the separator. Nothing else draws one.
     *
     * On top, not underneath, which is how GMP's order cards carry it — and it matters for the
     * first block in a list: with the gap below, the first block butts straight up against the
     * white filter rail above it and the two read as one surface.
     */
    marginTop: spacing.sm,
    minHeight: a11y.minTouchTarget,
    // Clips the strip's fill to the block on Android.
    overflow: 'hidden',
  },
  pressed: { backgroundColor: colors.blush },
  disabled: { opacity: 0.6 },
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  stripLabel: { flexShrink: 1 },
  // Pushed to the far edge of the strip, as GMP's item count is.
  stripMeta: { marginLeft: 'auto' },
  inner: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
  },
});

export default RowBlock;
