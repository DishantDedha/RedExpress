import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, spacing } from '../theme';

/**
 * The Red Express logo: a blood drop with a medical cross, over the wordmark.
 *
 * ## Why it is drawn rather than imported
 *
 * A PNG would need a `@3x` set and would go soft for a low-vision user running display zoom.
 * The drop is a rounded square with one sharp corner, rotated 45 degrees; the cross is two
 * bars counter-rotated back to upright inside it. It stays crisp at any size, and the "big
 * text" preference in Phase 11 can scale it by changing one number.
 *
 * ## What a screen reader hears
 *
 * The drawing is decorative and hidden outright — a blind user gains nothing from "image"
 * announced before the app's name, and everything the logo means is in the words beneath it.
 *
 * The wordmark is the visible text, so on a screen where it is the title it should also *be*
 * the heading rather than having a second, hidden one competing with it — two elements
 * saying "Red Express" is worse than none. Pass `headingRef` (from `useHeadingFocus`) and
 * `accessibilityLabel`, and the wordmark becomes the screen's heading: the reader lands on
 * it, and heading navigation finds it.
 *
 * Capitals are a real hazard in the strapline. VoiceOver and TalkBack both tend to spell
 * short all-caps strings out letter by letter, so "EMERGENCY BLOOD HELPLINE" risks becoming
 * twenty-three separate letters. The visible text keeps the capitals; what is spoken is
 * always sentence case — either from the strapline's own label, or folded into the heading.
 */
export function BrandMark({
  size = 88,
  showStrapline = true,
  /** From `useHeadingFocus()`. Makes the wordmark the screen's focused heading. */
  headingRef,
  /** What the heading says. Fold the strapline and tagline in — see the note above. */
  accessibilityLabel,
  style,
}) {
  const crossArm = size * 0.42;
  const crossThickness = size * 0.13;

  // When the heading already speaks the strapline, the strapline element must not repeat it.
  const straplineIsRedundant = Boolean(accessibilityLabel);

  return (
    <View style={[styles.container, style]}>
      <View
        style={[styles.drop, { width: size, height: size, borderRadius: size / 2 }]}
        // Decorative. Both properties are set because each platform reads only one of them.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {/* Counter-rotated so the cross stands upright inside the tilted drop. */}
        <View style={styles.crossHolder}>
          <View style={[styles.crossBar, { width: crossArm, height: crossThickness }]} />
          <View style={[styles.crossBar, { width: crossThickness, height: crossArm }]} />
        </View>
      </View>

      <AppText
        ref={headingRef}
        variant="display"
        color={colors.onPrimary}
        align="center"
        style={styles.wordmark}
        accessibilityLabel={accessibilityLabel}
        // `variant="display"` already carries accessibilityRole="header"; stated here so the
        // intent survives a future change to the variant.
        role="header"
        accessible
      >
        Red Express
      </AppText>

      {showStrapline ? (
        <AppText
          variant="caption"
          color={colors.onBrandMuted}
          align="center"
          style={styles.strapline}
          accessibilityLabel={straplineIsRedundant ? undefined : 'Emergency blood helpline'}
          accessibilityElementsHidden={straplineIsRedundant}
          importantForAccessibility={straplineIsRedundant ? 'no-hide-descendants' : 'yes'}
        >
          EMERGENCY BLOOD HELPLINE
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  drop: {
    backgroundColor: colors.onPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    // One square corner turns a circle into a drop; the rotation points it upwards.
    borderTopLeftRadius: 6,
    transform: [{ rotate: '-45deg' }],
  },
  crossHolder: {
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '45deg' }],
  },
  crossBar: {
    position: 'absolute',
    backgroundColor: colors.brand,
    borderRadius: 2,
  },
  wordmark: { marginTop: spacing.xl },
  strapline: {
    marginTop: spacing.xs,
    // Tracking, to match the mockup's spaced capitals.
    letterSpacing: 2,
  },
});

export default BrandMark;
