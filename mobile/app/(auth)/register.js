import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AppButton,
  AppText,
  Card,
  InitiativeFooter,
  Screen,
  ScreenHeader,
} from '../../components';
import { getAccessToken } from '../../services/tokenStorage';
import { colors, spacing } from '../../theme';

/**
 * "Join Red Express" — mockup 2. The fork between the two audiences.
 *
 * Each choice is a pressable `Card`, so it is a real button with a role and a label rather
 * than a tappable box. The `accessibilityLabel` folds the title and its description into one
 * phrase: a screen-reader user hears the whole choice at a single stop instead of swiping
 * between a heading and an explanation and reassembling them.
 *
 * ## Reached from two directions
 *
 * Normally this comes before sign-in and both paths lead to the number screen.
 *
 * It is also where a *newly created* account arrives when someone tapped "Login" with a
 * number Red Express had never seen (see `routeAfterVerify` in services/auth.js). They are
 * already verified, so sending them back for another code would be absurd — when a session
 * exists, the cards go straight to the matching registration form.
 */
export default function RegisterScreen() {
  const router = useRouter();
  const [signedIn, setSignedIn] = useState(null); // null while unknown

  useEffect(() => {
    let active = true;
    // A token is the whole test. The cached user's role is deliberately *not* consulted —
    // an account created by the login shortcut carries a default role nobody chose, and
    // choosing is exactly what this screen is for.
    getAccessToken().then((token) => {
      if (active) setSignedIn(Boolean(token));
    });
    return () => {
      active = false;
    };
  }, []);

  function choose(role) {
    if (signedIn) {
      router.replace(role === 'RECEIVER' ? '/receiver-form' : '/donor-form');
      return;
    }
    router.push({ pathname: '/phone', params: { mode: 'register', role } });
  }

  return (
    <Screen tone="brand" footer={<InitiativeFooter />}>
      <ScreenHeader
        title="Join Red Express"
        subtitle="Choose your registration type to get started."
        tone="brand"
        voicePurpose="Two choices. Become a donor to give blood, or find blood if you need it."
        voiceAction="Become a donor"
      />

      <Card
        title="Become a Donor"
        onPress={() => choose('DONOR')}
        accessibilityLabel="Become a donor. Register your blood group today and help save lives during emergencies."
        accessibilityHint={
          signedIn
            ? 'Opens the donor registration form'
            : 'Starts donor registration, beginning with your mobile number'
        }
      >
        <AppText variant="body" color={colors.textMuted}>
          Register your blood group today and help save lives during emergencies.
        </AppText>
      </Card>

      <Card
        title="Find Blood"
        onPress={() => choose('RECEIVER')}
        accessibilityLabel="Find blood. Search nearby donors by blood group for fast emergency blood support."
        accessibilityHint={
          signedIn
            ? 'Opens the short registration form for finding blood'
            : 'Starts a short registration so you can post a blood request'
        }
      >
        <AppText variant="body" color={colors.textMuted}>
          Search nearby donors by blood group for fast emergency blood support.
        </AppText>
      </Card>

      {!signedIn ? (
        <View style={styles.existing}>
          <AppText variant="body" color={colors.onBrandMuted}>
            Already have an account?
          </AppText>
          <AppButton
            title="Login Here"
            variant="brandOutline"
            size="small"
            fullWidth={false}
            onPress={() => router.push({ pathname: '/phone', params: { mode: 'login' } })}
            accessibilityLabel="Login here"
            accessibilityHint="Sign in with your registered mobile number"
            style={styles.loginButton}
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  existing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  loginButton: { paddingHorizontal: spacing.lg },
});
