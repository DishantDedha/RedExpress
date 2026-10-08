import { useCallback, useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { announce } from '../components';
import { onSessionEnded, SESSION_END_REASONS } from '../services/sessionEvents';
import { colors } from '../theme';
import { useAppFonts } from '../theme/fonts';

/**
 * Keep the splash up until the typefaces are in.
 *
 * Not cosmetic: every size in `typography` is set for Poppins and Playfair, so painting a
 * screen before they arrive draws the whole app in the platform system font and then reflows
 * every line of it a moment later. Held here, the first frame anyone sees is the right one.
 *
 * `catch` because this throws if the splash has already auto-hidden, which is not a reason to
 * fail to start.
 */
SplashScreen.preventAutoHideAsync().catch(() => {});

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
  const [fontsLoaded, fontError] = useAppFonts();

  // An error is not fatal. A font that failed to download leaves the app in the system font,
  // which is the state it shipped in for months — refusing to start would be worse than
  // looking wrong, and a donor opening this app may be in a hurry.
  const fontsSettled = fontsLoaded || Boolean(fontError);

  const onLayout = useCallback(() => {
    if (fontsSettled) SplashScreen.hideAsync().catch(() => {});
  }, [fontsSettled]);

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

  // Nothing is drawn until the fonts settle, so there is no system-font flash to reflow out
  // of. The splash is still up, which is the right thing to be looking at.
  if (!fontsSettled) return null;

  return (
    <SafeAreaProvider onLayout={onLayout}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          /**
           * No native header anywhere in the app.
           *
           * It used to be kept for its back button, drawn transparent above a screen's own red
           * band. That produced two bars of chrome on every pushed screen — a 44pt empty strip
           * and then the band under it — and the band had to carry 56px of top padding so its
           * title did not land under the floating arrow.
           *
           * `ScreenHeader` draws the back button itself now, as a white disc inside the red,
           * which is both GMP's pattern and one bar instead of two. The platform back *gesture*
           * is unaffected: it does not come from the header.
           */
          headerShown: false,
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
