import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { announce } from '../components';
import { onSessionEnded, SESSION_END_REASONS } from '../services/sessionEvents';
import { colors, typography } from '../theme';

/**
 * The root of the navigation tree.
 *
 * It does two jobs: it establishes the stack that every screen lives in, and it listens for
 * the session ending.
 *
 * ## Forced sign-out
 *
 * `apiClient` cannot navigate — it is a plain module with no router. So when it sees the
 * backend reject a token it emits an event, and this is what acts on it: wipe the user back
 * to the sign-in screen, and *say why*.
 *
 * The "why" is the part that matters. A donor who was marked unreachable in the CRM and is
 * suddenly dumped at a login screen mid-task has no idea what happened, and a screen-reader
 * user gets no visual cue at all. The reason is announced immediately and also passed to the
 * sign-in screen as a parameter so it can be displayed and re-read. Signing in again is the
 * fix — verifying an OTP flips a DEAD donor back to ACTIVE (Phase 2).
 */

const REASON_MESSAGES = {
  [SESSION_END_REASONS.TOKEN_VERSION_MISMATCH]:
    'You have been signed out. Please verify your mobile number again to continue.',
  [SESSION_END_REASONS.EXPIRED]: 'Your session has expired. Please sign in again.',
  [SESSION_END_REASONS.INVALID]: 'Your session is no longer valid. Please sign in again.',
  [SESSION_END_REASONS.BLOCKED]:
    'This account has been blocked. Please contact Red Express support for help.',
  [SESSION_END_REASONS.SIGNED_OUT]: 'You have been signed out.',
};

export default function RootLayout() {
  const router = useRouter();

  useEffect(
    () =>
      onSessionEnded(({ reason, message }) => {
        const text = REASON_MESSAGES[reason] ?? message;

        // Spoken straight away rather than waiting for the sign-in screen to mount and take
        // focus — a sudden screen change with no explanation is disorienting, and worse when
        // you cannot see that it happened.
        announce(text);

        // replace, not push: there is no "back" to a session that no longer exists.
        router.replace({ pathname: '/login', params: { reason, notice: text } });
      }),
    [router],
  );

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          // The native header is kept for one reason: its back button. React Navigation
          // labels it correctly for both screen readers and it matches the platform gesture,
          // which a hand-rolled chevron does not.
          //
          // Its *title* is blank on purpose. Each screen renders its own <ScreenHeader/>,
          // which is the heading the reader is focused on; a native title as well would mean
          // the screen name is read twice on every navigation.
          headerShown: true,
          headerTitle: '',
          headerTintColor: colors.primary,
          headerStyle: { backgroundColor: colors.background },
          headerShadowVisible: false,
          headerBackTitleStyle: typography.body,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />

        {/*
          `(auth)` and `(app)` are themselves Stack navigators. Left with the header above,
          each of their screens would render two stacked headers — and, worse for a screen
          reader, two back buttons one after the other. The group owns its own header; this
          one steps out of the way.
        */}
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
