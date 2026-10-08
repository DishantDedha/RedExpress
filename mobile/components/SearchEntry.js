import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useHighContrast } from '../hooks/usePreferences';
import { colors, radius, spacing, a11y } from '../theme';

/**
 * The white search box that sits in a red hero band.
 *
 * GMP's home header has one, and it is the single element that makes that header read as a
 * place you *do* something rather than a coloured strip with a name in it. Red Express's home
 * band had a greeting, two chips and nothing to touch.
 *
 * ## It is a button, not a field
 *
 * Tapping it opens the screen that owns the search — the query, the filters, the results. Two
 * live inputs on two screens would be two implementations of the same thing, and this one has
 * nowhere to put results anyway.
 *
 * That is also the accessible shape. A `TextInput` here would be announced as an edit field
 * that silently moves you to another screen the moment you touch it, which is the kind of
 * thing that loses a screen-reader user entirely. This announces "Find blood donors, button"
 * and does what it said.
 *
 * The grey line inside is therefore *not* a placeholder — it is the button's visible label,
 * which is why it is `text`-coloured copy at 17.9:1 rather than the 4.5:1 grey a placeholder
 * would be, and why it is not repeated in `accessibilityLabel`.
 */
export function SearchEntry({
  /** The visible label. Written as the thing you are about to do. */
  label = 'Find blood donors',
  /** Overrides the spoken name when the visible label is terse out of context. */
  accessibilityLabel,
  accessibilityHint,
  onPress,
  style,
}) {
  const contrast = useHighContrast();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={accessibilityHint}
      style={({ pressed }) => [
        styles.box,
        // A white box on red has no edge of its own and does not need one — the surface it
        // sits on is 5.98:1 against it. Under high contrast it gains one anyway, because that
        // preference exists for people who cannot rely on a fill boundary at all.
        contrast.on && { borderWidth: contrast.width(1), borderColor: colors.text },
        pressed && styles.pressed,
        style,
      ]}
    >
      <AppText variant="body" color={colors.text} numberOfLines={1} style={styles.label}>
        {label}
      </AppText>

      {/* Decorative — the label says what this does. */}
      <View style={styles.glyph}>
        <Icon name="search" size={20} color={colors.primary} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    // A minimum, so the box grows with the OS text size instead of clipping its label — GMP's
    // is a fixed 46 and loses the last word at 200%.
    minHeight: a11y.minTouchTarget,
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingVertical: spacing.sm,
  },
  pressed: { backgroundColor: colors.primaryTint },
  label: { flex: 1 },
  glyph: { paddingHorizontal: spacing.sm },
});

export default SearchEntry;
