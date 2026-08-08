import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AppButton,
  AppText,
  Card,
  LiveMessage,
  PushConsent,
  Screen,
  ScreenHeader,
} from '../../components';
import { bloodGroupLabel } from '../../data/bloodGroups';
import { listNotifications } from '../../services/notifications';
import { getMe } from '../../services/profile';
import { signOut } from '../../services/session';
import { colors, spacing } from '../../theme';

/**
 * Home, after sign-in.
 *
 * Three facts and four ways out. The facts are what a donor opens the app to check — who
 * they are, what group they are registered with, whether they are currently showing as
 * available. The ways out are the whole product: find donors, request blood, read alerts,
 * edit the profile.
 *
 * Reloaded with `useFocusEffect` rather than `useEffect`, because coming back from the
 * profile screen after switching availability off must not leave this screen insisting you
 * are available — and coming back from the inbox must not leave a stale unread count.
 *
 * `PushConsent` sits near the top because notification permission is asked once per install
 * and a donor who never sees the explanation never gets alerted about anything. It renders
 * nothing at all once alerts are on.
 */
export default function HomeScreen() {
  const router = useRouter();

  const [me, setMe] = useState(null);
  const [unreadCount, setUnreadCount] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      setLoading(true);
      getMe()
        .then((result) => {
          if (active) {
            setMe(result);
            setError(null);
          }
        })
        .catch((err) => {
          // A 401 has already been handled by apiClient — it wiped the session and the root
          // layout is routing to sign-in. Anything else is worth showing.
          if (active && err.status !== 401) setError(err.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });

      // The badge only needs the count, so the smallest page the server will serve is
      // requested — `unreadCount` comes back on every response regardless of the filter.
      listNotifications({ unreadOnly: true, pageSize: 1 })
        .then((result) => {
          if (active) setUnreadCount(result.unreadCount);
        })
        .catch(() => {
          // A missing badge is not worth an error banner on the home screen.
        });

      return () => {
        active = false;
      };
    }, []),
  );

  const donor = me?.donorProfile;
  const isDonor = me?.user?.role === 'DONOR';

  return (
    <Screen>
      <ScreenHeader
        title={me?.user?.name ? `Hello, ${me.user.name}` : 'Home'}
        subtitle={
          isDonor
            ? 'Your donor account is active.'
            : 'You can post a blood request and reach donors near you.'
        }
        voicePurpose={
          isDonor
            ? 'This is your home screen. You can find donors, request blood, or check your alerts.'
            : 'This is your home screen. You can find donors or post a blood request.'
        }
        voiceAction="Find blood donors"
      />

      {loading && !me ? <LiveMessage message="Loading your details…" tone="progress" /> : null}
      {error ? <LiveMessage message={error} tone="error" /> : null}

      <PushConsent />

      {/* --- The two things this app is for -------------------------------- */}

      <AppButton
        title="Find blood donors"
        size="large"
        onPress={() => router.push('/find-donors')}
        accessibilityHint="Search donors by blood group, area, and distance from you"
        style={styles.action}
      />

      <AppButton
        title="Request blood"
        size="large"
        variant="secondary"
        onPress={() => router.push('/post-request')}
        accessibilityHint="Posts a request and alerts matching donors near the hospital"
        style={styles.action}
      />

      <AppButton
        title={unreadCount ? `Your alerts, ${unreadCount} unread` : 'Your alerts'}
        variant="secondary"
        onPress={() => router.push('/notifications')}
        // The count is in the visible title as well, so it is never carried by a coloured
        // dot alone — but it is spelled out here too in case the title is truncated.
        accessibilityLabel={
          unreadCount
            ? `Your alerts. ${unreadCount} unread.`
            : 'Your alerts. Nothing unread.'
        }
        accessibilityHint="Blood requests you have been alerted about"
        style={styles.action}
      />

      {/* --- Your record --------------------------------------------------- */}

      {donor ? (
        // One stop for the three facts, so they are heard as a sentence rather than as six
        // fragments to reassemble.
        <Card
          grouped
          title="Your donor record"
          accessibilityLabel={`Your donor record. Blood group ${bloodGroupLabel(donor.bloodGroup)}. ${
            donor.isAvailable
              ? 'You are shown as available to donate.'
              : 'You are shown as not available to donate.'
          } Registered in ${[donor.city, donor.district].filter(Boolean).join(', ')}.`}
        >
          <Fact label="Blood group" value={bloodGroupLabel(donor.bloodGroup)} />
          <Fact
            label="Availability"
            value={
              donor.isAvailable
                ? 'Available to donate'
                : 'Not available — you will not appear in searches'
            }
          />
          <Fact
            label="Registered in"
            value={[donor.city, donor.district].filter(Boolean).join(', ') || 'Not set'}
          />
        </Card>
      ) : null}

      {isDonor ? (
        <AppButton
          title="View and edit your profile"
          variant="secondary"
          onPress={() => router.push('/profile')}
          accessibilityHint="Opens your donor profile, availability and last donation date"
          style={styles.action}
        />
      ) : (
        <AppButton
          title="Complete your donor registration"
          variant="secondary"
          onPress={() => router.push('/donor-form')}
          accessibilityHint="Opens the donor registration form"
          style={styles.action}
        />
      )}

      {/* Not buried in a menu. A user who needs bigger text or a voice reading the screen
          needs to find this without being able to read the screen it is on, so it is a
          full-width labelled button in the main column like everything else. */}
      <AppButton
        title="Accessibility settings"
        variant="secondary"
        onPress={() => router.push('/settings')}
        accessibilityHint="Voice guidance, big text, high contrast and dictation"
        style={styles.action}
      />

      {/* A full-width labelled button in the main column, not fine print in a footer. The
          people most affected by what this screen explains — donors handing over a phone
          number and a home address — are the ones least able to find a grey 8pt link. */}
      <AppButton
        title="Privacy and permissions"
        variant="secondary"
        onPress={() => router.push('/privacy')}
        accessibilityHint="What Red Express knows about you, who can see it, and how to change it"
        style={styles.action}
      />

      <AppButton
        title="See the component kit"
        variant="link"
        onPress={() => router.push('/demo')}
        accessibilityHint="Opens a demonstration of the app's accessible components"
      />

      <AppButton
        title="Sign out"
        variant="link"
        // `signOut`, not `api.signOut`: this hands the push token back first, so the next
        // blood request does not arrive on a phone whose owner has left.
        onPress={() => signOut()}
        accessibilityHint="Signs you out and returns to the sign in screen"
        style={styles.signOut}
      />
    </Screen>
  );
}

function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="body" style={styles.factValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  fact: { marginBottom: spacing.md },
  factValue: { marginTop: spacing.xs },
  action: { marginBottom: spacing.lg },
  signOut: { marginTop: spacing.md },
});
