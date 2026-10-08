import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useHighContrast } from '../hooks/usePreferences';
import { hapticTap } from '../services/feedback';
import { colors, spacing, radius, elevation, a11y } from '../theme';

/**
 * A large tappable tile: an icon, a title, and a line explaining what it does.
 *
 * This is what replaced the stack of identical full-width buttons on the home screen. The
 * stack was not only plain — it was flat in the sense that matters, because "Find blood
 * donors" and "Privacy and permissions" were drawn at exactly the same weight. A tile says
 * which actions are the product and which are housekeeping, and it says it in three ways at
 * once: size, an icon, and where it sits on the screen.
 *
 * ## The two layouts
 *
 * **`stacked`** (the default) is the two-up tile: a round icon badge, then the title and
 * description underneath it. The hero actions on a screen.
 *
 * **`row`** is GMP's menu row — icon on the left, title with a 12px hint under it, a red
 * chevron on the right — and it is what the long lists of settings and policy links should
 * have been all along. Eleven stacked tiles down the profile screen was the old home screen's
 * problem moved one tab over: every row the height of a card, so the list did not read as a
 * list and you scrolled past the thing you came for.
 *
 * ## Still one button
 *
 * Either layout is a `Pressable` with `accessibilityRole="button"` and a 48dp minimum, exactly
 * like `AppButton`, and the same guarantees apply. The whole tile is one focus stop announcing
 * "Find blood donors, button" with the description as its hint, rather than a title and a
 * subtitle a screen-reader user has to swipe between and reassemble.
 *
 * The icon and the chevron are both decorative — see `Icon`. Everything they suggest is in the
 * title beside them, and the chevron in particular says "this opens something", which the
 * button role already says.
 *
 * ## Layout under font scaling
 *
 * Stacked tiles are laid out by the caller in a wrapping row, and each one sizes to its
 * content rather than to a fixed height. At 200% text a two-up row becomes two stacked tiles
 * and the descriptions wrap, which is the behaviour that keeps the last word on screen. A row
 * tile grows downwards the same way, and its badge and chevron stay put at the top rather
 * than drifting to the middle of three wrapped lines.
 */

const TONES = {
  /** The primary action on the screen. A filled red tile. */
  primary: {
    bg: colors.primary,
    bgPressed: colors.primaryPressed,
    fg: colors.onPrimary,
    muted: colors.onBrandMuted,
    border: 'transparent',
    badge: 'rgba(255, 255, 255, 0.18)',
    badgeFg: colors.onPrimary,
    chevron: colors.onPrimary,
  },
  /** The secondary action: a blush tile that reads as red without competing with the fill. */
  tint: {
    bg: colors.blush,
    bgPressed: colors.blushStrong,
    fg: colors.primaryOnTint,
    muted: colors.textMuted,
    border: colors.blushLine,
    badge: colors.white,
    badgeFg: colors.primaryOnTint,
    chevron: colors.primaryOnTint,
  },
  /** Everything else — a plain white tile with GMP's neutral-200 edge. */
  plain: {
    bg: colors.card,
    bgPressed: colors.surface,
    fg: colors.text,
    muted: colors.textMuted,
    border: colors.borderMuted,
    badge: colors.blush,
    badgeFg: colors.primary,
    chevron: colors.primary,
  },
};

export function ActionTile({
  title,
  description,
  icon,
  onPress,
  tone = 'plain',
  /** 'stacked' — the two-up hero tile. 'row' — GMP's full-width menu row. */
  layout = 'stacked',
  /** Overrides the spoken name. The description is passed as the hint either way. */
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  haptic = true,
  style,
  ...rest
}) {
  const contrast = useHighContrast();
  const palette = TONES[tone] ?? TONES.plain;
  const row = layout === 'row';

  const fill = tone === 'primary' ? contrast.fill(palette.bg) : palette.bg;
  // A blush tile has a barely-there edge by design; under high contrast it needs a real one,
  // or the tile stops being a distinguishable object.
  const border = contrast.borderMuted(palette.border);

  function handlePress(event) {
    if (disabled) return;
    if (haptic) hapticTap();
    onPress?.(event);
  }

  const badge = icon ? (
    <View
      style={[
        styles.badge,
        row && styles.badgeRow,
        { backgroundColor: palette.badge },
        // On a plain row the badge is a blush disc on white, which has no edge of its own.
        tone === 'plain' && row && { borderWidth: contrast.width(1), borderColor: contrast.borderMuted(colors.blushLine) },
      ]}
    >
      <Icon name={icon} size={row ? 18 : 22} color={palette.badgeFg} />
    </View>
  ) : null;

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityHint={accessibilityHint ?? description}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.tile,
        row ? styles.tileRow : styles.tileStacked,
        tone !== 'plain' && elevation.sm,
        {
          backgroundColor: pressed && !disabled ? palette.bgPressed : fill,
          borderColor: border === 'transparent' ? fill : border,
          borderWidth: contrast.width(1),
        },
        disabled && styles.disabled,
        style,
      ]}
      {...rest}
    >
      {row ? (
        <>
          {badge}

          <View style={styles.rowText}>
            <AppText variant="bodyStrong" color={palette.fg}>
              {title}
            </AppText>
            {description ? (
              <AppText variant="footnote" color={palette.muted} style={styles.rowDescription}>
                {description}
              </AppText>
            ) : null}
          </View>

          {/* Decorative. The button role already says this opens something. */}
          <Icon name="chevron" size={18} color={palette.chevron} style={styles.chevron} />
        </>
      ) : (
        <>
          {badge}

          <AppText variant="bodyStrong" color={palette.fg} style={styles.title}>
            {title}
          </AppText>

          {description ? (
            <AppText variant="footnote" color={palette.muted} style={styles.description}>
              {description}
            </AppText>
          ) : null}
        </>
      )}
    </Pressable>
  );
}

/**
 * The row stacked tiles are laid out in.
 *
 * `flexWrap` is the whole point: at a large OS font size the tiles stop fitting side by side
 * and stack instead of squeezing a title onto four clipped lines.
 */
export function ActionRow({ children, style }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  tile: {
    minHeight: a11y.minTouchTarget,
    borderRadius: radius.xl,
  },
  tileStacked: {
    flexGrow: 1,
    // Below this a two-up row is doing nobody any favours, and `flexWrap` on the parent
    // stacks the tiles instead.
    flexBasis: 150,
    padding: spacing.lg,
  },
  tileRow: {
    flexDirection: 'row',
    // `flex-start`, not `center`: at a large text size the title wraps to three lines and a
    // centred badge ends up floating beside the middle one.
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  /** A circle, like GMP's category and profile badges. */
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  badgeRow: {
    width: 38,
    height: 38,
    marginBottom: 0,
    marginRight: spacing.md,
  },
  rowText: { flex: 1, paddingTop: 2 },
  rowDescription: { marginTop: 1 },
  chevron: { marginLeft: spacing.sm, marginTop: spacing.sm },
  title: { marginBottom: 2 },
  description: { flexShrink: 1 },
  disabled: { opacity: 0.6 },
});

export default ActionTile;
