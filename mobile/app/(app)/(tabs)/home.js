import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActionRow,
  ActionTile,
  AppText,
  Avatar,
  Card,
  Chip,
  LiveMessage,
  PushConsent,
  Screen,
  ScreenHeader,
  SectionHeading,
} from '../../../components';
import { bloodGroupLabel } from '../../../data/bloodGroups';
import { listNotifications } from '../../../services/notifications';
import { getMe } from '../../../services/profile';
import { colors, spacing } from '../../../theme';

/**
 * Home, after sign-in.
 *
 * ## What changed, and why it is not only cosmetic
 *
 * This screen used to be eight full-width buttons in a column — "Find blood donors" and
 * "Privacy and permissions" rendered at identical size, weight and colour. Everything was
 * equally important, which is the same as nothing being important. A donor opening the app
 * during an emergency had to read a list to find the one thing they came for.
 *
 * Now the screen answers three questions in the order they are asked:
 *
 *   who am I      the hero band — name, blood group, whether you are currently listed as
 *                 available. The three facts a donor opens the app to check.
 *   what can I do two tiles, sized and coloured to say which is the primary action.
 *   what happened the alerts card, carrying its unread count.
 *
 * The five housekeeping buttons moved to the profile tab, and the four destinations that
 * were buried in that column are now permanent tabs — see `(tabs)/_layout.js`.
 *
 * ## The facts are still one stop, not six
 *
 * The identity block in the hero is a single `accessible` view with a written-out label, so
 * a screen-reader user hears "Hello Ravi. O positive. You are shown as available to donate."
 * as one sentence. Split across an avatar, a heading and two chips it would be four stops to
 * assemble a fact you should be told outright — and the chips would be read as bare words
 * with no indication of what they are chips *of*.
 *
 * Reloaded with `useFocusEffect` rather than `useEffect`, because coming back from the
 * profile tab after switching availability off must not leave this screen insisting you are
 * available — and coming back from the alerts tab must not leave a stale unread count.
 *
 * `PushConsent` sits at the top of the sheet because notification permission is asked once
 * per install and a donor who never sees the explanation never gets alerted about anything.
 * It renders nothing at all once alerts are on.
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
  const name = me?.user?.name;
  const group = donor ? bloodGroupLabel(donor.bloodGroup) : null;

  // Written for the ear as sentences. Full stops are the only punctuation that reliably
  // gives a listener a beat between facts.
  const identityLabel = [
    name ? `Hello, ${name}.` : 'Home.',
    group ? `${group}.` : null,
    donor
      ? donor.isAvailable
        ? 'You are shown as available to donate.'
        : 'You are shown as not available to donate.'
      : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Screen
      hero={
        <View>
          <ScreenHeader
            title={name ? `Hello, ${name}` : 'Home'}
            subtitle={
              isDonor
                ? 'Your donor account is active.'
                : 'You can post a blood request and reach donors near you.'
            }
            tone="brand"
            accessibilityLabel={identityLabel}
            voicePurpose={
              isDonor
                ? 'This is your home screen. You can find donors, request blood, or check your alerts.'
                : 'This is your home screen. You can find donors or post a blood request.'
            }
            voiceAction="Find blood donors"
            style={styles.heroHeader}
          >
            {donor ? (
              <View
                // Decoration for the facts already spoken by the heading above. Left
                // reachable it would repeat "O positive" and "available" as two bare words
                // with nothing to say what they describe.
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.chips}
              >
                <Chip label={group} tone="onBrand" />
                <Chip
                  label={donor.isAvailable ? 'Available' : 'Not available'}
                  tone="onBrand"
                  icon={donor.isAvailable ? 'check' : undefined}
                />
              </View>
            ) : null}
          </ScreenHeader>

          {name ? <Avatar name={name} size={56} tone="onBrand" style={styles.avatar} /> : null}
        </View>
      }
    >
      {loading && !me ? <LiveMessage message="Loading your details…" tone="progress" /> : null}
      {error ? <LiveMessage message={error} tone="error" /> : null}

      <PushConsent />

      <SectionHeading
        overline="WHAT DO YOU NEED"
        title="Get help, or give it"
        style={styles.section}
      />

      <ActionRow>
        <ActionTile
          title="Find blood donors"
          description="Search by blood group and how far away they are."
          icon="search"
          tone="primary"
          onPress={() => router.push('/find-donors')}
          accessibilityHint="Search donors by blood group, area, and distance from you"
        />
        <ActionTile
          title="Request blood"
          description="Alert matching donors near the hospital."
          icon="drop"
          tone="tint"
          onPress={() => router.push('/post-request')}
          accessibilityHint="Posts a request and alerts matching donors near the hospital"
        />
      </ActionRow>

      <SectionHeading title="Your alerts" style={styles.section} />

      <ActionTile
        title={unreadCount ? `${unreadCount} unread` : 'Nothing unread'}
        description="Blood requests you have been alerted about."
        icon="bell"
        onPress={() => router.push('/notifications')}
        // The count is in the visible title as well, so it is never carried by a coloured
        // dot alone — but it is spelled out here in case the title is truncated.
        accessibilityLabel={
          unreadCount ? `Your alerts. ${unreadCount} unread.` : 'Your alerts. Nothing unread.'
        }
        accessibilityHint="Blood requests you have been alerted about"
      />

      {donor ? (
        <>
          <SectionHeading title="Your donor record" style={styles.section} />

          {/* One stop, so the facts are heard as a sentence rather than as six fragments to
              reassemble. */}
          <Card
            grouped
            accessibilityLabel={`Your donor record. Blood group ${group}. ${
              donor.isAvailable
                ? 'You are shown as available to donate.'
                : 'You are shown as not available to donate.'
            } Registered in ${[donor.city, donor.district].filter(Boolean).join(', ')}.`}
          >
            <Fact label="Blood group" value={group} />
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
        </>
      ) : (
        <ActionTile
          title="Complete your donor registration"
          description="Add your blood group so nearby patients can reach you."
          icon="plus"
          tone="tint"
          onPress={() => router.push('/donor-form')}
          accessibilityHint="Opens the donor registration form"
          style={styles.section}
        />
      )}
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
  heroHeader: { marginBottom: 0, paddingRight: 72 },
  // Sits in the space the header's right padding reserved for it, so a long name wraps
  // beside the avatar instead of underneath it.
  avatar: { position: 'absolute', top: 0, right: 0 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  section: { marginTop: spacing.xl },
  fact: { marginBottom: spacing.md },
  factValue: { marginTop: spacing.xs },
});
