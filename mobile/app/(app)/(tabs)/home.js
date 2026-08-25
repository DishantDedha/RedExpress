import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
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
 *   what happened the requests card, pointing at what you have posted and its status.
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
 * available.
 *
 * `PushConsent` sits at the top of the sheet because notification permission is asked once
 * per install and a donor who never sees the explanation never gets alerted about anything.
 * It renders nothing at all once alerts are on.
 *
 * ## Alerts are not shown here twice
 *
 * This screen used to carry its own "N unread" preview tile alongside the Alerts tab in the
 * bar below — the same destination, reached two ways, with the count kept in sync in two
 * places instead of one. The tab bar is always visible and already says "Alerts"; a second
 * entry point one scroll away added a decision ("which one do I tap") without adding
 * information. What sat there now points at requests, which the tab bar has no tab for.
 */
export default function HomeScreen() {
  const router = useRouter();

  const [me, setMe] = useState(null);
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

          {name ? (
            // The avatar looks like a profile shortcut everywhere this pattern appears, so it
            // has to behave like one — previously this was a plain decorative View a tap did
            // nothing to. `/profile` is one of the four permanent tabs (see (tabs)/_layout.js),
            // so this just switches tabs; it does not push a new screen over the bar.
            <Pressable
              onPress={() => router.push('/profile')}
              accessibilityRole="button"
              accessibilityLabel="Open your profile"
              accessibilityHint="Opens your profile, availability and account settings"
              hitSlop={8}
              style={({ pressed }) => [styles.avatarButton, pressed && styles.avatarButtonPressed]}
            >
              <Avatar name={name} size={56} tone="onBrand" />
            </Pressable>
          ) : null}
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

      <SectionHeading title="Your requests" style={styles.section} />

      <ActionTile
        title="See your requests"
        description="Everything you have posted, and its status."
        icon="list"
        onPress={() => router.push('/requests')}
        accessibilityHint="Requests you have posted, and whether they are still open"
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
  avatarButton: { position: 'absolute', top: 0, right: 0, borderRadius: 999 },
  avatarButtonPressed: { opacity: 0.75 },
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
