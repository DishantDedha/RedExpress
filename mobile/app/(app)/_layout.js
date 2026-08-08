import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Redirect, Stack } from 'expo-router';
import { LiveMessage, Screen, ScreenHeader } from '../../components';
import { useNotificationRouting } from '../../hooks/useNotificationRouting';
import { getAccessToken } from '../../services/tokenStorage';
import { colors, typography } from '../../theme';

/**
 * The signed-in stack: home, profile, donor search, blood requests and the notification
 * inbox.
 *
 * ## The guard
 *
 * These screens show personal data and call endpoints that require a token, so reaching one
 * without a session should not mean watching a screen load and then fail. The check is local
 * and cheap — is there a token in secure storage — and the server re-validates every call
 * regardless, which is where the real authority lives.
 *
 * It is deliberately *not* a validity check. Deciding here whether a token is still good
 * would mean a network round trip before the first paint, and `apiClient` already handles the
 * answer: a rejected token wipes the session and the root layout routes to sign-in with a
 * spoken explanation. This guard only catches the plainer case of no session at all.
 *
 * While the token is being read, a screen-reader user gets "Checking your sign in" rather
 * than a blank screen and silence.
 */
export default function AppLayout() {
  const [signedIn, setSignedIn] = useState(null); // null = still checking

  useEffect(() => {
    let active = true;
    getAccessToken().then((token) => {
      if (active) setSignedIn(Boolean(token));
    });
    return () => {
      active = false;
    };
  }, []);

  if (signedIn === null) {
    return (
      <Screen>
        <ScreenHeader title="Red Express" subtitle="Checking your sign in." />
        <LiveMessage message="Checking your sign in…" tone="progress" />
        <View />
      </Screen>
    );
  }

  if (!signedIn) {
    return <Redirect href="/login" />;
  }

  return (
    <>
      {/* Only once the guard has passed. A notification tapped while signed out would
          otherwise navigate to a request screen that immediately redirects to sign-in,
          losing the deep link — the donor would arrive at a login form with no idea what
          their phone had just buzzed about. */}
      <NotificationRouter />

      <Stack
        screenOptions={{
          headerShown: true,
          // Blank on purpose: each screen renders its own <ScreenHeader/>, which is the
          // heading the reader is focused on. A native title as well would mean the screen
          // name is read twice on every navigation.
          headerTitle: '',
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerBackTitleStyle: typography.body,
          contentStyle: { backgroundColor: colors.background },
        }}
      />
    </>
  );
}

/** Renders nothing; exists so the deep-link listener is mounted behind the auth guard. */
function NotificationRouter() {
  useNotificationRouting();
  return null;
}
