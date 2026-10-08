import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  ActionTile,
  AppText,
  Avatar,
  ChipRail,
  Chip,
  LiveMessage,
  PushConsent,
  QuickActions,
  RowBlock,
  Screen,
  ScreenHeader,
  SearchEntry,
  SectionHeading,
} from '../../../components';
import { BLOOD_GROUP_OPTIONS, bloodGroupLabel } from '../../../data/bloodGroups';
import { getMe } from '../../../services/profile';
import { colors, spacing } from '../../../theme';

/**
 * Home, after sign-in.
 *
 * ## The shape of the screen
 *
 * It answers three questions in the order they are asked:
 *
 *   who am I      the band — name, blood group, whether you are currently listed as available.
 *                 The three facts a donor opens the app to check.
 *   what can I do the search box, then the strip of three shortcuts beneath it.
 *   what now      the blood-group rail, then your own requests.
 *
 * ## What the redesign changed, and why none of it is only cosmetic
 *
 * The screen used to be the band, then two large tiles with a sentence of explanation each,
 * then a third tile, then a card of facts — four full-width objects stacked down the page, each
 * about 110px tall, none of them showing any actual information. It read as a menu, which is
 * what the tab bar is already for.
 *
 * Three changes:
 *
 *   the strip      Three shortcuts in 90px instead of three tiles in 330. The sentence each tile
 *                  carried moves to the shortcut's accessibility *hint*, which is where an
 *                  explanation belongs: read after the name, only when the user pauses there.
 *   the rail       The blood groups, as a row of pills that open a prefiltered search. This is
 *                  the first thing on the screen that is content rather than navigation, and it
 *                  is the fastest route to the one question the app exists to answer.
 *   the facts      The donor record is a two-column grid in a full-bleed block rather than four
 *                  stacked label-and-value pairs, so it is about 90px instead of 220.
 *
 * ## The groups are spelled out, here as everywhere
 *
 * The rail says "O positive", not "O+". Pills rather than the round tiles GMP's category strip
 * uses, and that is exactly why: a 56px circle cannot hold "O positive", and what will fit is
 * the symbol — which this app never renders, on screen or off it, because "O plus" and "O minus"
 * are a one-syllable difference on a field where being wrong is a medical error. See
 * `data/bloodGroups.js`.
 *
 * ## The facts are still one stop, not six
 *
 * The identity block in the band is a single `accessible` view with a written-out label, so a
 * screen-reader user hears "Hello Ravi. O positive. You are shown as available to donate." as
 * one sentence. Split across an avatar, a heading and two chips it would be four stops to
 * assemble a fact you should be told outright — and the chips would be read as bare words with
 * nothing to say what they describe.
 *
 * Reloaded with `useFocusEffect` rather than `useEffect`, because coming back from the profile
 * tab after switching availability off must not leave this screen insisting you are available.
 *
 * `PushConsent` sits at the top of the page because notification permission is asked once per
 * install and a donor who never sees the explanation never gets alerted about anything. It
 * renders nothing at all once alerts are on.
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

  // Written for the ear as sentences. Full stops are the only punctuation that reliably gives a
  // listener a beat between facts.
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
      heroTop={spacing.sm}
      heroPadding={spacing.lg}
      hero={
        <>
          <ScreenHeader
            title={name ? `Hello, ${name}` : 'Home'}
            subtitle={
              isDonor
                ? 'Your donor account is active.'
                : 'Post a blood request and reach donors near you.'
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
            actions={
              name ? (
                // The avatar looks like a profile shortcut everywhere this pattern appears, so
                // it has to behave like one. `/profile` is one of the four permanent tabs, so
                // this switches tabs; it does not push a screen over the bar.
                <Pressable
                  onPress={() => router.push('/profile')}
                  accessibilityRole="button"
                  accessibilityLabel="Open your profile"
                  accessibilityHint="Opens your profile, availability and account settings"
                  hitSlop={8}
                  style={({ pressed }) => [styles.avatarButton, pressed && styles.pressed]}
                >
                  <Avatar name={name} size={44} tone="onBrand" />
                </Pressable>
              ) : null
            }
          >
            {donor ? (
              <View
                // Decoration for the facts already spoken by the heading above. Left reachable
                // it would repeat "O positive" and "available" as two bare words with nothing
                // to say what they describe.
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={styles.chips}
              >
                <Chip label={group} tone="onBrand" size="sm" />
                <Chip
                  label={donor.isAvailable ? 'Available' : 'Not available'}
                  tone="onBrand"
                  size="sm"
                  icon={donor.isAvailable ? 'check' : undefined}
                />
              </View>
            ) : null}
          </ScreenHeader>

          <SearchEntry
            label="Find blood donors near you"
            accessibilityLabel="Find blood donors"
            accessibilityHint="Search donors by blood group, area, and distance from you"
            onPress={() => router.push('/find-donors')}
          />

          <QuickActions
            style={styles.quickActions}
            items={[
              {
                key: 'request',
                label: 'Request blood',
                icon: 'drop',
                onPress: () => router.push('/post-request'),
                accessibilityHint: 'Posts a request and alerts matching donors near the hospital',
              },
              {
                key: 'requests',
                label: 'Your requests',
                icon: 'list',
                onPress: () => router.push('/requests'),
                accessibilityHint: 'Requests you have posted, and whether they are still open',
              },
              {
                key: 'donors',
                label: 'Find donors',
                icon: 'search',
                onPress: () => router.push('/find-donors'),
                accessibilityHint: 'Search donors by blood group, area, and distance from you',
              },
            ]}
          />
        </>
      }
    >
      {loading && !me ? <LiveMessage message="Loading your details…" tone="progress" /> : null}
      {error ? <LiveMessage message={error} tone="error" /> : null}

      <PushConsent />

      <SectionHeading
        overline="WHO NEEDS BLOOD"
        title="Search by group"
        description="Opens the donor search with that group already chosen."
        style={styles.firstSection}
      />

      {/*
        Full-bleed: the rail scrolls sideways, and a rail inset by the page's 16px gutter stops
        16px short of the edge, which reads as the list having ended rather than continuing.
        Its own `paddingHorizontal` puts the first pill back on the gutter.
      */}
      <ChipRail
        surface={false}
        accessibilityLabel="Search donors by blood group"
        style={styles.rail}
        items={BLOOD_GROUP_OPTIONS.map((option) => ({
          value: option.value,
          label: option.label,
          accessibilityLabel: `Find ${option.label} donors`,
        }))}
        onSelect={(bloodGroup) => router.push({ pathname: '/find-donors', params: { bloodGroup } })}
      />

      {donor ? (
        <>
          <SectionHeading title="Your donor record" style={styles.section} />

          {/* One stop, so the facts are heard as a sentence rather than as six fragments to
              reassemble. Full-bleed, like the rail, so it is not a floating card between two
              things that run to the edge. */}
          <RowBlock
            grouped
            style={styles.block}
            status={{
              label: donor.isAvailable ? 'Available to donate' : 'Not available',
              tone: donor.isAvailable ? 'success' : 'neutral',
              icon: donor.isAvailable ? 'check' : 'user',
            }}
            accessibilityLabel={`Your donor record. Blood group ${group}. ${
              donor.isAvailable
                ? 'You are shown as available to donate.'
                : 'You are shown as not available to donate, so you will not appear in searches.'
            } Registered in ${[donor.city, donor.district].filter(Boolean).join(', ') || 'nowhere yet'}.`}
          >
            <View style={styles.facts}>
              <Fact label="Blood group" value={group} />
              <Fact
                label="Registered in"
                value={[donor.city, donor.district].filter(Boolean).join(', ') || 'Not set'}
              />
            </View>
          </RowBlock>
        </>
      ) : (
        <ActionTile
          layout="row"
          tone="tint"
          title="Complete your donor registration"
          description="Add your blood group so nearby patients can reach you."
          icon="plus"
          onPress={() => router.push('/donor-form')}
          accessibilityHint="Opens the donor registration form"
          style={styles.section}
        />
      )}
    </Screen>
  );
}

/** One label-and-value pair, half the width of the block. */
function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <AppText variant="footnote" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="bodyStrong" style={styles.factValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  // The band's children supply their own spacing now, so the header does not carry a 24px
  // bottom margin on top of them.
  heroHeader: { marginBottom: spacing.lg },
  avatarButton: { borderRadius: 999 },
  pressed: { opacity: 0.75 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  quickActions: { marginTop: spacing.md },
  // The sheet already pads itself by 24; a section heading that adds another 24 on top of that
  // opens a gap the design does not have.
  firstSection: { marginTop: 0 },
  section: { marginTop: spacing.xl },
  // Cancels the page gutter so the rail and the block run to both edges.
  rail: { marginHorizontal: -spacing.lg },
  block: { marginHorizontal: -spacing.lg },
  facts: {
    flexDirection: 'row',
    // At a large text size the two columns stack rather than squeezing a city name into half a
    // screen one word at a time.
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  fact: { flexGrow: 1, flexBasis: 130 },
  factValue: { marginTop: 1 },
});
