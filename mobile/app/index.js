import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppButton, AppText, BrandMark, InitiativeFooter, Screen } from '../components';
import { useHeadingFocus } from '../hooks/useAccessibilityFocus';
import { useScreenIntroduction } from '../hooks/useVoiceGuidance';
import { colors, spacing } from '../theme';

/**
 * Landing — mockup 1. The first thing anyone sees, sighted or not.
 *
 * ## What a screen reader user hears first
 *
 * The wordmark inside `BrandMark` is this screen's heading, and `useHeadingFocus` moves the
 * reader's cursor to it on mount. So the app opens by saying what it is — "Red Express,
 * emergency blood helpline, heading" — and one swipe on gives the tagline that explains what
 * it does. Not "button", and not silence.
 *
 * This screen uses no `ScreenHeader`, which is the one exception in the app. A `ScreenHeader`
 * would draw "Red Express" a second time under a logo that already says it in display type;
 * hiding it off-screen instead would leave two elements both announcing the app's name, and
 * two entries in heading navigation for one title. One heading, and it is the thing you can
 * actually see.
 *
 * The tagline is marked `role="text"` so it does not become a second heading — it is body
 * copy that happens to be set large.
 *
 * ## The two buttons
 *
 * Side by side as in the mockup, but each one flexes and the row wraps: at 200% font size
 * they stack instead of squeezing "Register" onto two clipped lines. Both are drawn for the
 * red surface — see `AppButton` for why a darker-red button on red does not pass.
 */
export default function LandingScreen() {
  const router = useRouter();
  const headingRef = useHeadingFocus();

  // This screen renders no `ScreenHeader` (see above), so the voice introduction that every
  // other screen inherits from it is wired up by hand here. It is the one place in the app
  // where that is true, and it is the first thing a user hears — worth the exception.
  useScreenIntroduction({
    title: 'Red Express',
    purpose: 'Find blood donors near you in an emergency.',
    action: 'Login, or Register if you are new',
  });

  return (
    <Screen
      tone="brand"
      footer={
        <View>
          <View style={styles.actions}>
            <View style={styles.action}>
              <AppButton
                title="Login"
                variant="brand"
                size="large"
                onPress={() => router.push({ pathname: '/phone', params: { mode: 'login' } })}
                accessibilityHint="Sign in with your registered mobile number"
              />
            </View>
            <View style={styles.action}>
              <AppButton
                title="Register"
                variant="brandOutline"
                size="large"
                onPress={() => router.push('/register')}
                accessibilityHint="Create an account as a blood donor or to find blood"
              />
            </View>
          </View>

          <InitiativeFooter />
        </View>
      }
    >
      <View style={styles.hero}>
        <BrandMark
          headingRef={headingRef}
          accessibilityLabel="Red Express, emergency blood helpline"
        />

        <AppText
          variant="heading"
          color={colors.onPrimary}
          align="center"
          // Large body copy, not a section heading: keep it out of heading navigation.
          role="text"
          style={styles.tagline}
        >
          Find{' '}
          <AppText variant="heading" color={colors.onPrimary} role="text" style={styles.emphasis}>
            blood donors
          </AppText>{' '}
          instantly and provide lifesaving support to patients in need.
        </AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, justifyContent: 'center', paddingVertical: spacing.xxl },
  tagline: { marginTop: spacing.xxl, paddingHorizontal: spacing.sm },
  // Bold carries the emphasis on screen. It is not the only signal for anyone else: the
  // sentence reads the same either way, so nothing is lost when the styling is not perceived.
  emphasis: { fontWeight: '800' },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  // Each button takes half the row but may not shrink below a readable width; once the
  // labels outgrow that, `flexWrap` above puts them on separate lines.
  action: { flexGrow: 1, flexBasis: 140 },
});
