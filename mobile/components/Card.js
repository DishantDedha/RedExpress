import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useHighContrast } from '../hooks/usePreferences';
import { colors, spacing, radius, elevation, a11y } from '../theme';

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
        // GMP's card titles are 16 semibold with a 12px line under them, not 17/14. The
        // smaller caption is what lets a card hold a title, a hint and its content without
        // the first two shouting over the third.
        <AppText variant="bodyStrong" role="header" style={styles.title}>
          {title}
        </AppText>
      ) : null}
      {subtitle ? (
        <AppText variant="footnote" color={colors.textMuted} style={styles.subtitle}>
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
  /**
   * GMP's catalogue card: a 16px radius, a neutral-200 line all the way round, and a shadow
   * barely there behind it.
   *
   * The shadow used to do the work and the border was a backstop. That is the wrong way round
   * on a white page — a soft shadow on white reads as a smudge, where a 1px line reads as an
   * edge. Now the line is the card and the shadow only lifts it. It also means the card looks
   * the same on Android with elevation off, under "remove animations", and in high-contrast
   * mode, rather than dissolving into the page in all three.
   */
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.xl,
    padding: spacing.lg,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    ...elevation.sm,
  },
  pressable: { minHeight: a11y.minTouchTarget },
  pressed: { backgroundColor: colors.primaryTint, borderColor: colors.primary },
  disabled: { opacity: 0.6 },
  title: { marginBottom: spacing.xs },
  subtitle: { marginBottom: spacing.sm },
});

export default Card;
