import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useHighContrast } from '../hooks/usePreferences';
import { hapticTap } from '../services/feedback';
import { a11y, colors, radius, spacing } from '../theme';

/**
 * The strip of shortcuts inside the red band — GMP's category strip, which is the element that
 * makes that app's header read as a place you do something rather than a coloured rectangle
 * with a name in it.
 *
 * Three or four translucent tiles in a row, each an icon over a short label. Translucent rather
 * than a flat tint so they sit *in* the gradient instead of cutting rectangles out of it, which
 * is what a solid panel on a ramp looks like.
 *
 * ## Why these and not more tiles below
 *
 * Home used to carry two large tiles with a sentence of explanation each, then a third, then a
 * fourth. Four full-width objects down a screen is a menu, and a menu is what a tab bar is for.
 * The strip puts the same destinations one tap away in 90px instead of 400, which leaves the
 * page below free to show something — the blood groups, the user's own requests — rather than
 * restating the navigation.
 *
 * ## The label is never dropped
 *
 * Three or four words at 12px, always visible. An icon-only strip would be four glyphs a
 * sighted user has to learn and a reader has to be told about separately; here the label is both
 * the visible text and the accessible name, and the icon is decorative (see `Icon`).
 *
 * `accessibilityHint` carries the sentence the old tiles put on screen — "Search donors by blood
 * group, area, and distance from you". It is the right place for it: a hint is read after the
 * name, only when the user pauses on the control, which is exactly when an explanation is
 * wanted and never when it is in the way.
 *
 * ## Font scaling
 *
 * The tiles are a wrapping row of flex children with a `flexBasis`, so at a large text size
 * three across becomes two and then one, growing downwards. Nothing is a fixed height and no
 * label is truncated — a two-line label simply makes every tile in the row taller, since they
 * stretch to match.
 */
export function QuickActions({
  /** `[{ key, label, icon, onPress, accessibilityHint }]`, in strip order. */
  items,
  style,
}) {
  const contrast = useHighContrast();

  return (
    <View style={[styles.row, style]}>
      {items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => {
            hapticTap();
            item.onPress?.();
          }}
          accessibilityRole="button"
          accessibilityLabel={item.accessibilityLabel ?? item.label}
          accessibilityHint={item.accessibilityHint}
          style={({ pressed }) => [
            styles.tile,
            {
              backgroundColor: pressed ? colors.brandPanelPressed : colors.brandPanel,
              // A translucent panel on red has a soft edge by design. High contrast gives it a
              // hard white one — the preference exists for people who cannot rely on a fill
              // boundary at all, and white is the highest-contrast edge available on deep red.
              borderWidth: contrast.width(1),
              borderColor: contrast.on ? colors.onPrimary : colors.brandPanelLine,
            },
          ]}
        >
          <Icon name={item.icon} size={22} color={colors.onPrimary} />

          <AppText
            variant="footnote"
            weight="semibold"
            color={colors.onPrimary}
            align="center"
            style={styles.label}
          >
            {item.label}
          </AppText>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    // At a large text size three tiles stop fitting side by side and stack instead of squeezing
    // a label onto four clipped lines.
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  tile: {
    flexGrow: 1,
    // Below this a three-up row is doing nobody any favours, and `flexWrap` stacks them.
    flexBasis: 86,
    minHeight: a11y.minTouchTarget + spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  label: { flexShrink: 1 },
});

export default QuickActions;
