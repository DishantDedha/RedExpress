import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useHighContrast } from '../hooks/usePreferences';
import { colors, spacing, radius } from '../theme';

/**
 * A small labelled pill: a blood group, an availability state, an unread count.
 *
 * ## It always carries a word
 *
 * Every tone here has a text label and none of them may be used without one. That is the
 * same rule the status badges in the CRM follow and it is not stylistic: colour alone is not
 * allowed to carry meaning (WCAG 1.4.1), and to a blind user a tone does not exist at all.
 * The `icon` is decoration on top of the word, never instead of it.
 *
 * ## Short labels are a speech hazard
 *
 * A chip whose visible text is an abbreviation must be given `accessibilityLabel` carrying
 * the full form. Note that blood groups are *not* such a case here: unlike the CRM, this app
 * never renders "O+" at all, on screen or off it — see `data/bloodGroups.js` for why the
 * spelled-out "O positive" is the visible label as well as the spoken one.
 */

const TONES = {
  /** The default: a blush fill carrying the deep red. 8.51:1. */
  tint: { bg: colors.primaryTint, fg: colors.primaryOnTint, border: 'transparent' },
  /** A filled red pill for the one thing on a card that matters most. */
  solid: { bg: colors.primary, fg: colors.onPrimary, border: 'transparent' },
  /** On a red surface: white outline, white text. */
  onBrand: { bg: 'transparent', fg: colors.onPrimary, border: colors.onPrimary },
  neutral: { bg: colors.surface, fg: colors.textMuted, border: colors.borderMuted },
  success: { bg: colors.successTint, fg: colors.success, border: 'transparent' },
  warning: { bg: colors.warningTint, fg: colors.warning, border: 'transparent' },
  error: { bg: colors.errorTint, fg: colors.error, border: 'transparent' },
};

export function Chip({
  label,
  tone = 'tint',
  /** A name from `Icon`. Decorative — the label carries the meaning. */
  icon,
  size = 'md',
  /** Required when `label` is an abbreviation. See the note above. */
  accessibilityLabel,
  style,
}) {
  const contrast = useHighContrast();
  const palette = TONES[tone] ?? TONES.tint;
  const small = size === 'sm';

  // A tinted chip is a fill with no edge, which is exactly the distinction reduced contrast
  // sensitivity removes — at which point a blush pill on a white card is not a pill at all.
  const border = contrast.on && palette.border === 'transparent' ? contrast.borderMuted(palette.border) : palette.border;

  return (
    <View
      // One stop, so the icon and the word are never read as two unrelated things.
      accessible
      accessibilityLabel={accessibilityLabel ?? (typeof label === 'string' ? label : undefined)}
      style={[
        styles.chip,
        {
          backgroundColor: palette.bg,
          borderColor: border,
          borderWidth: border === 'transparent' ? 0 : contrast.width(1),
          paddingVertical: small ? spacing.xs : spacing.sm - 2,
          paddingHorizontal: small ? spacing.sm : spacing.md,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={small ? 12 : 14} color={palette.fg} style={styles.icon} /> : null}
      <AppText variant={small ? 'caption' : 'label'} color={palette.fg} style={styles.label}>
        {label}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    gap: spacing.xs,
    // Clips the fill to the pill radius on Android, which otherwise squares the corners off.
    overflow: 'hidden',
  },
  icon: { marginRight: 1 },
  // Lets a long label wrap instead of pushing the chip past the edge of its card at 200%
  // text size.
  label: { flexShrink: 1 },
});

export default Chip;
