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
 * ## Still one button
 *
 * A tile is a `Pressable` with `accessibilityRole="button"` and a 48dp minimum, exactly like
 * `AppButton`, and the same guarantees apply. The whole tile is one focus stop announcing
 * "Find blood donors, button" with the description as its hint, rather than a title and a
 * subtitle a screen-reader user has to swipe between and reassemble.
 *
 * The icon is decorative — see `Icon`. Everything it suggests is in the title beside it.
 *
 * ## Layout under font scaling
 *
 * Tiles are laid out by the caller in a wrapping row, and each one sizes to its content
 * rather than to a fixed height. At 200% text a two-up row becomes two stacked tiles and the
 * descriptions wrap, which is the behaviour that keeps the last word on screen.
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
  },
  /** The secondary action: a blush tile that reads as red without competing with the fill. */
  tint: {
    bg: colors.blush,
    bgPressed: colors.blushStrong,
    fg: colors.primaryOnTint,
    muted: colors.textMuted,
    border: colors.blushLine,
    badge: colors.primaryTint,
  },
  /** Everything else — a plain white tile. */
  plain: {
    bg: colors.card,
    bgPressed: colors.surface,
    fg: colors.text,
    muted: colors.textMuted,
    border: colors.borderMuted,
    badge: colors.surface,
  },
};

export function ActionTile({
  title,
  description,
  icon,
  onPress,
  tone = 'plain',
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

  const fill = tone === 'primary' ? contrast.fill(palette.bg) : palette.bg;
  // A blush tile has a barely-there edge by design; under high contrast it needs a real one,
  // or the tile stops being a distinguishable object.
  const border = contrast.borderMuted(palette.border);

  function handlePress(event) {
    if (disabled) return;
    if (haptic) hapticTap();
    onPress?.(event);
  }

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
      {icon ? (
        <View style={[styles.badge, { backgroundColor: palette.badge }]}>
          <Icon name={icon} size={22} color={palette.fg} />
        </View>
      ) : null}

      <AppText variant="subheading" color={palette.fg} style={styles.title}>
        {title}
      </AppText>

      {description ? (
        <AppText variant="caption" color={palette.muted} style={styles.description}>
          {description}
        </AppText>
      ) : null}
    </Pressable>
  );
}

/**
 * The row tiles are laid out in.
 *
 * `flexWrap` is the whole point: at a large OS font size the tiles stop fitting side by side
 * and stack instead of squeezing a title onto four clipped lines.
 */
export function ActionRow({ children, style }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  tile: {
    flexGrow: 1,
    // Below this a two-up row is doing nobody any favours, and `flexWrap` on the parent
    // stacks the tiles instead.
    flexBasis: 150,
    minHeight: a11y.minTouchTarget,
    borderRadius: radius.xl,
    padding: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  badge: {
    width: 44,
    height: 44,
    borderRadius: radius.md + 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: { marginBottom: spacing.xs },
  description: { flexShrink: 1 },
  disabled: { opacity: 0.6 },
});

export default ActionTile;
