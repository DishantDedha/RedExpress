import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, spacing } from '../theme';

/**
 * "An initiative by WE4YOU" — the attribution line at the foot of every pre-sign-in screen
 * in the mockups.
 *
 * It is one accessible element rather than two pieces of text, so a screen-reader user
 * hears the whole credit in a single stop instead of swiping past "An initiative by" and
 * then "WE4YOU" as if they were unrelated.
 *
 * The spoken form is spelled "We4You" rather than the visible capitals: "WE4YOU" is short
 * enough that both TalkBack and VoiceOver are liable to read it out as individual letters
 * and a digit.
 *
 * ## Tone
 *
 * The credit used to appear only on full-bleed red screens, so its colours were hard-coded
 * for red. The redesign moved most of those screens onto a white sheet, where white text is
 * invisible — hence the prop. It is not a styling convenience: getting it wrong makes the
 * line unreadable rather than merely off-palette, which is why the two colours move together
 * as a set rather than being passed in individually.
 */
export function InitiativeFooter({ tone = 'default', style }) {
  const brand = tone === 'brand';

  return (
    <View
      accessible
      accessibilityLabel="An initiative by We4You"
      style={[styles.container, style]}
    >
      <AppText variant="caption" color={brand ? colors.onBrandMuted : colors.textMuted}>
        An initiative by{' '}
      </AppText>
      <AppText
        variant="bodyStrong"
        color={brand ? colors.onPrimary : colors.primary}
        style={styles.mark}
      >
        WE4YOU
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    // Wraps rather than clipping when the OS font size is turned up.
    flexWrap: 'wrap',
    paddingTop: spacing.xl,
  },
  mark: { letterSpacing: 1 },
});

export default InitiativeFooter;
