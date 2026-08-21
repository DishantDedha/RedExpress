import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AppButton,
  AppText,
  BrandMark,
  InitiativeFooter,
  Screen,
  SectionHeading,
} from '../components';
import { useHeadingFocus } from '../hooks/useAccessibilityFocus';
import { useScreenIntroduction } from '../hooks/useVoiceGuidance';
import { colors, spacing } from '../theme';

/**
 * Landing — the first thing anyone sees, sighted or not.
 *
 * ## The redesign
 *
 * This screen used to be red edge to edge, with two buttons drawn for a red surface. It is
 * now the app's statement of what red and white each do: the brand owns the top of the
 * screen as a gradient band carrying the logo and the promise, and the actions sit on a
 * white sheet that curves up over it. Everything you are asked to *do* happens on white.
 *
 * That is not only a look. The white-surface button variants are the ones with the most
 * contrast headroom — `primary` is white on red at 7.33:1 and `secondary` is a red label on
 * white with a red outline — where the old brand-surface pair had to be inverted to avoid a
 * 1.34:1 edge (see `AppButton`). The layout and the accessibility pull in the same
 * direction here rather than against each other.
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
 * Stacked rather than side by side. The old row put Login and Register at identical weight
 * and, at 200% font size, wrapped them into a stack anyway — so this is the layout most
 * users with a large text setting were getting regardless, minus the reflow. Login leads
 * because returning donors are the traffic; Register is a full-width outlined button
 * directly beneath it, not a secondary afterthought.
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
      heroAngle={18}
      heroPadding={spacing.xxl}
      hero={
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
      }
    >
      <SectionHeading
        overline="GET STARTED"
        title="Ready when you are"
        description="Sign in with your mobile number, or create an account in under a minute."
      />

      <AppButton
        title="Login"
        size="large"
        onPress={() => router.push({ pathname: '/phone', params: { mode: 'login' } })}
        accessibilityHint="Sign in with your registered mobile number"
        style={styles.action}
      />

      <AppButton
        title="Register"
        variant="secondary"
        size="large"
        onPress={() => router.push('/register')}
        accessibilityHint="Create an account as a blood donor or to find blood"
      />

      <View style={styles.spacer} />

      <InitiativeFooter />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'stretch', paddingVertical: spacing.lg },
  tagline: { marginTop: spacing.xl, paddingHorizontal: spacing.sm },
  // Bold carries the emphasis on screen. It is not the only signal for anyone else: the
  // sentence reads the same either way, so nothing is lost when the styling is not perceived.
  emphasis: { fontWeight: '800' },
  action: { marginBottom: spacing.md },
  // Pushes the credit to the bottom of the sheet without pinning it there, so it moves down
  // rather than overlapping when the text size grows.
  spacer: { flexGrow: 1, minHeight: spacing.xl },
});
