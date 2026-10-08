import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useHighContrast } from '../hooks/usePreferences';
import { hapticTap } from '../services/feedback';
import { a11y, colors, radius, spacing } from '../theme';

/**
 * A horizontal rail of pills, scrolled sideways.
 *
 * GMP's filter row: a white strip under the header holding "All", "Order Placed", "In Transit"
 * and the rest as 32px outlined pills, the active one outlined and lettered in red. It is the
 * single most useful bit of chrome that app has, and this one had nothing like it — the alerts
 * screen expressed "show only unread" as a full-width switch with two sentences of state copy
 * under it, which is a paragraph where GMP has two pills.
 *
 * ## Two modes
 *
 * **Filter** — pass `value` and `onChange`. One pill is selected, the rail reports itself as a
 * tab list, and each pill carries `accessibilityState.selected`. That is the honest role: these
 * are mutually exclusive views of one list, which is what a tab is, and it means a reader says
 * "Unread, tab, 2 of 2, selected" rather than leaving the user to infer from a tint.
 *
 * **Navigation** — pass `onSelect` and no `value`. Nothing is selected; each pill is a button
 * that goes somewhere. The blood-group rail on Home is this.
 *
 * ## Why selection is not carried by colour alone
 *
 * The selected pill changes three things at once: its outline goes red, its label goes red and
 * semibold, and it fills with the blush tint. Any one of those alone would be a colour-only
 * signal (WCAG 1.4.1) or, in the case of weight, too subtle to find. Together they are legible
 * in greyscale — and `accessibilityState.selected` means none of it has to be perceived at all.
 *
 * The red label sits on the blush fill, so it is `primaryOnTint` rather than `primary`: the
 * brand red on its own 50 tint is 4.27:1.
 *
 * ## Font scaling
 *
 * The pills are sized by `minHeight` and padding, never a fixed height, and the rail scrolls
 * horizontally — so at 200% text the pills grow and the rail simply gets longer, which is the
 * one layout that cannot break. The label is never truncated.
 */
/** Vertical hitSlop that takes a 32px pill to the 48dp minimum. */
const PILL_SLOP = (a11y.minTouchTarget - spacing.xxl) / 2;

export function ChipRail({
  /** `[{ value, label, accessibilityLabel? }]`, in rail order. */
  items,
  /** Filter mode: the selected value. */
  value,
  /** Filter mode: called with the newly selected value. */
  onChange,
  /** Navigation mode: called with the tapped value. */
  onSelect,
  /** What the rail as a whole is, for the reader: "Filter alerts". */
  accessibilityLabel,
  /** Paint the strip the rail sits in. Off when it is already on the right surface. */
  surface = true,
  style,
}) {
  const contrast = useHighContrast();
  const isFilter = typeof onChange === 'function';

  return (
    <View
      accessibilityRole={isFilter ? 'tablist' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={[surface && styles.surface, style]}
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {items.map((item) => {
          const selected = isFilter && item.value === value;

          return (
            <Pressable
              key={String(item.value)}
              onPress={() => {
                hapticTap();
                if (isFilter) onChange(item.value);
                else onSelect?.(item.value);
              }}
              accessibilityRole={isFilter ? 'tab' : 'button'}
              accessibilityState={isFilter ? { selected } : undefined}
              accessibilityLabel={item.accessibilityLabel ?? item.label}
              // The pills are 32 tall by design, under the 48dp minimum. They sit in a row of
              // adjacent targets rather than as isolated controls, so the slop is applied
              // vertically only: horizontally it would overlap the neighbouring pill.
              hitSlop={{ top: PILL_SLOP, bottom: PILL_SLOP }}
              style={({ pressed }) => [
                styles.pill,
                {
                  borderWidth: contrast.width(1),
                  borderColor: selected
                    ? contrast.fill(colors.primary)
                    : contrast.border(colors.neutralRamp[300]),
                  backgroundColor: selected
                    ? colors.primaryTint
                    : pressed
                      ? colors.surface
                      : colors.card,
                },
              ]}
            >
              <AppText
                variant="footnote"
                weight={selected ? 'semibold' : 'body'}
                color={selected ? colors.primaryOnTint : colors.textMuted}
              >
                {item.label}
              </AppText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  // The white strip the rail sits in, so it reads as chrome attached to the header rather than
  // as the first item of the list below it.
  surface: {
    backgroundColor: colors.card,
    paddingVertical: spacing.md,
  },
  rail: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  pill: {
    // A minimum, so a pill grows with the text rather than clipping it. GMP's is a fixed 32.
    minHeight: spacing.xxl,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    overflow: 'hidden',
  },
});

export default ChipRail;
