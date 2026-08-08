import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useHighContrast } from '../hooks/usePreferences';
import { colors, spacing, radius, shadow, a11y } from '../theme';

/**
 * A white panel on the grey screen background.
 *
 * ## Grouping
 *
 * The `grouped` prop is the reason this component is more than a styled `View`. A donor
 * result card (Phase 10) holds a name, a blood group, a distance and a Call button. Left
 * ungrouped, a screen-reader user swipes through four separate nodes and has to hold the
 * association in their head — and in a list of twenty donors they lose track of which
 * distance belonged to which name.
 *
 * With `grouped`, the card is one stop that announces "Ravi Kumar, O positive, 3.2
 * kilometres away" as a single phrase, and the Call button remains separately reachable
 * inside it. That is the shape a list of results should have.
 *
 * Pass `accessibilityLabel` when grouping: the auto-generated one concatenates the visible
 * text in render order, which is rarely a sentence.
 *
 * ## Pressable cards
 *
 * Give a card `onPress` and it becomes a real button — role, state, and a 48dp minimum
 * height. It never becomes a `View` with a tap handler, which is invisible to a screen
 * reader and unreachable by keyboard.
 */
export function Card({
  children,
  title,
  subtitle,
  onPress,
  grouped = false,
  accessibilityLabel,
  accessibilityHint,
  disabled = false,
  style,
  ...rest
}) {
  const contrast = useHighContrast();

  // A card is separated from the page by a shadow and a 1px near-white border — a distinction
  // that disappears entirely with reduced contrast sensitivity, taking with it the grouping
  // that tells you which donor's phone number you are looking at. High contrast makes the
  // edge a real line.
  const edge = contrast.on && {
    borderWidth: 2,
    borderColor: contrast.borderMuted(colors.borderMuted),
  };

  const body = (
    <>
      {title ? (
        <AppText variant="subheading" style={styles.title}>
          {title}
        </AppText>
      ) : null}
      {subtitle ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.subtitle}>
          {subtitle}
        </AppText>
      ) : null}
      {children}
    </>
  );

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
          styles.card,
          styles.pressable,
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
      // `accessible` collapses the subtree into one focus stop. Only when asked for — applied
      // by default it would make every form card a single unusable blob.
      accessible={grouped}
      accessibilityLabel={grouped ? accessibilityLabel : undefined}
      accessibilityHint={grouped ? accessibilityHint : undefined}
      style={[styles.card, edge, style]}
      {...rest}
    >
      {body}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    // A border as well as a shadow. Shadows vanish under Android's "remove animations"
    // setting and in high-contrast modes; the border is what keeps the card's edge visible.
    borderWidth: 1,
    borderColor: colors.borderMuted,
    ...shadow.card,
  },
  pressable: { minHeight: a11y.minTouchTarget },
  pressed: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  disabled: { opacity: 0.6 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.sm },
});

export default Card;
