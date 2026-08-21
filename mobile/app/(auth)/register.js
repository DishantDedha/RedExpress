import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  ActionTile,
  AppButton,
  AppText,
  InitiativeFooter,
  Screen,
  ScreenHeader,
} from '../../components';
import { getAccessToken } from '../../services/tokenStorage';
import { colors, spacing } from '../../theme';

/**
 * "Join Red Express" — the fork between the two audiences.
 *
 * Each choice is an `ActionTile`, so it is a real button with a role and a label rather than
 * a tappable box, and the tile's `accessibilityHint` carries the description — a
 * screen-reader user hears the whole choice at a single stop instead of swiping between a
 * heading and an explanation and reassembling them.
 *
 * The two are deliberately not drawn at equal weight. Becoming a donor is the ask; finding
 * blood is the need that brought most people here. Giving the donor tile the filled red and
 * the receiver tile the blush fill says which is which without either becoming hard to find,
 * and the labels say it outright for anyone who cannot see the difference.
 *
 * ## Reached from two directions
 *
 * Normally this comes before sign-in and both paths lead to the number screen.
 *
 * It is also where a *newly created* account arrives when someone tapped "Login" with a
 * number Red Express had never seen (see `routeAfterVerify` in services/auth.js). They are
 * already verified, so sending them back for another code would be absurd — when a session
 * exists, the tiles go straight to the matching registration form.
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
    <Screen
      hero={
        <ScreenHeader
          title="Join Red Express"
          subtitle="Choose your registration type to get started."
          tone="brand"
          voicePurpose="Two choices. Become a donor to give blood, or find blood if you need it."
          voiceAction="Become a donor"
        />
      }
      footer={<InitiativeFooter />}
    >
      <ActionTile
        title="Become a Donor"
        description="Register your blood group today and help save lives during emergencies."
        icon="drop"
        tone="primary"
        onPress={() => choose('DONOR')}
        accessibilityLabel="Become a donor"
        accessibilityHint={
          signedIn
            ? 'Register your blood group. Opens the donor registration form.'
            : 'Register your blood group. Starts donor registration, beginning with your mobile number.'
        }
        style={styles.tile}
      />

      <ActionTile
        title="Find Blood"
        description="Search nearby donors by blood group for fast emergency blood support."
        icon="search"
        tone="tint"
        onPress={() => choose('RECEIVER')}
        accessibilityLabel="Find blood"
        accessibilityHint={
          signedIn
            ? 'Search nearby donors. Opens the short registration form for finding blood.'
            : 'Search nearby donors. Starts a short registration so you can post a blood request.'
        }
        style={styles.tile}
      />

      {!signedIn ? (
        <View style={styles.existing}>
          <AppText variant="body" color={colors.textMuted}>
            Already have an account?
          </AppText>
          <AppButton
            title="Login Here"
            variant="link"
            size="small"
            fullWidth={false}
            onPress={() => router.push({ pathname: '/phone', params: { mode: 'login' } })}
            accessibilityLabel="Login here"
            accessibilityHint="Sign in with your registered mobile number"
          />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tile: { marginBottom: spacing.md },
  existing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
