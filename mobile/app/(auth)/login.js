import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * `/login` is an alias for the mobile-number screen in sign-in mode.
 *
 * Mockup 5 makes it plain that signing in *is* entering a phone number — there is no
 * separate login screen to build. The route still exists because things point at it: the
 * root layout sends a forced sign-out here, and Phase 10's route guard will too. Keeping the
 * name stable means neither has to know that the screen behind it is `/phone`.
 *
 * `notice` and `reason` are carried through untouched. That is how a donor who was marked
 * unreachable in the CRM finds out why they were signed out: `/phone` shows the message in a
 * live region, and the root layout has already spoken it.
 *
 * `replace` rather than a push, so the back gesture does not return to a screen that only
 * ever redirects.
 */
export default function LoginRedirect() {
  const { notice, reason } = useLocalSearchParams();

  return (
    <Redirect
      href={{
        pathname: '/phone',
        params: { mode: 'login', ...(notice ? { notice } : {}), ...(reason ? { reason } : {}) },
      }}
    />
  );
}
