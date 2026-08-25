import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  AppButton,
  AppText,
  Card,
  LiveMessage,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../components';
import { getLocationPermissionStatus } from '../services/location';
import { getPushPermissionStatus } from '../services/push';
import { config } from '../services/config';
import { colors, spacing } from '../theme';

/**
 * Privacy, consent, and the two permissions this app asks for.
 *
 * ## Why a screen and not a link to a web page
 *
 * Red Express holds a person's phone number, home address, blood group and coordinates —
 * health-adjacent data about people who signed up during someone else's emergency. Under the
 * DPDP Act the notice has to say what is collected, why, and who sees it, in plain language.
 * A link to a PDF satisfies a lawyer and nobody else: it opens a browser, loses the screen
 * reader's place, and is unreadable to the exact user this app was built for.
 *
 * So the substance is here, as ordinary app text a screen reader can move through heading by
 * heading — including the terms of use, one tap away, which is native for the same reason.
 *
 * ## Why this lives at the root of the route tree
 *
 * `(app)`'s layout redirects anyone without a session to `/login`. This screen is also linked
 * from the donor and receiver registration forms, before an account exists — so it sits
 * alongside `demo.js` at the root, outside that guard, reachable either way.
 *
 * ## Why the permission states are shown here
 *
 * "We use your location" is a claim. "Location: allowed — used to measure how far you are
 * from a request" is a fact the user can check and change. Both permissions are read without
 * prompting (see getLocationPermissionStatus), because the OS grants exactly one prompt per
 * install and spending it on a page someone opened to read would be indefensible.
 *
 * Reloaded on focus, since either permission can be changed in Settings while the app sits in
 * the background.
 */
export default function PrivacyScreen() {
  const router = useRouter();
  const say = useAnnounce();
  const [permissions, setPermissions] = useState(null);
  const [note, setNote] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      Promise.all([getLocationPermissionStatus(), getPushPermissionStatus()]).then(
        ([location, push]) => {
          if (active) setPermissions({ location, push });
        },
      );

      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen>
      <ScreenHeader
        title="Privacy and permissions"
        subtitle="What Red Express knows about you, who can see it, and how to change it."
        voicePurpose="This screen explains what information Red Express holds about you and who can see it."
        voiceAction="Read what is collected, or open your phone settings to change a permission"
      />

      <LiveMessage message={note} tone="warning" />

      {/* --- What is held --------------------------------------------------- */}

      <Card title="What we hold">
        <Item
          label="Your mobile number"
          detail="This is how you sign in — there is no password. It is also how our team reaches you about a request."
        />
        <Item
          label="Your name and blood group"
          detail="Shown to people searching for a donor, so they know who they are calling and whether your blood can help."
        />
        <Item
          label="Where you are"
          detail="Your area, and your coordinates if you shared them. Used only to work out how far you are from a patient."
        />
        <Item
          label="Your address and PIN code"
          detail="Only if you typed them. Never shown to another app user — only to Red Express staff."
        />
        <Item
          label="Your donation history"
          detail="The last date you told us you donated, so you are not asked again too soon."
          last
        />
      </Card>

      {/* --- Who sees it ---------------------------------------------------- */}

      <Card title="Who can see it">
        <Item
          label="Other people using the app"
          detail="Your name, blood group, city and phone number, and roughly how far away you are — rounded, never your street address or exact position. Only while you are shown as available to donate."
        />
        <Item
          label="Red Express staff"
          detail="Your full record, including your address, so they can call you and direct you to the right hospital. Every time a staff member changes your account it is recorded with their name."
        />
        <Item
          label="Nobody else"
          detail="Your details are not sold, shared with advertisers, or used for anything other than matching blood donors to patients."
          last
        />
      </Card>

      {/* --- Where it's held ------------------------------------------------- */}

      <Card title="Behind the scenes">
        <Item
          label="A few specialist services help us run the app"
          detail="A text message provider sends the one-time code when you sign in, a notification service delivers alerts to your phone, and our hosting provider stores your account securely. None of them may use your details for anything of their own."
        />
        <Item
          label="Kept while your account is active"
          detail="We keep your profile, past requests and call history so matching keeps working correctly, until you ask us to delete your account — see below."
          last
        />
      </Card>

      {/* --- Control -------------------------------------------------------- */}

      <Card title="What you control">
        <Item
          label="Turn availability off"
          detail="On your profile screen. You disappear from every search and stop receiving alerts immediately, without deleting anything."
        />
        <Item
          label="Change or remove your details"
          detail="Edit them on your profile, or email us to have your account and everything in it deleted."
          last
        />

        <AppButton
          title="Email us about your data"
          variant="secondary"
          onPress={() => {
            say('Opening your email app.');
            Linking.openURL(
              `mailto:${config.supportEmail}?subject=${encodeURIComponent('My Red Express data')}`,
            ).catch(() => setNote(`Could not open your email app. Email ${config.supportEmail} for a copy.`));
          }}
          accessibilityHint={`Opens your email app with a message to ${config.supportEmail}`}
          style={styles.action}
        />
      </Card>

      {/* --- Permissions ---------------------------------------------------- */}

      <Card title="Permissions on this phone">
        {permissions === null ? (
          <LiveMessage message="Checking your permissions…" tone="progress" />
        ) : (
          <>
            <Permission
              label="Location"
              status={permissions.location}
              granted="Allowed. Used to measure how far you are from a patient — never to track where you go."
              denied="Not allowed. Red Express uses the address you typed instead, which works but is less precise."
              blocked="Turned off for Red Express. You can turn it on in your phone settings. Your typed address is used in the meantime."
              disabled="Location services are off on this phone. Your typed address is used instead."
            />
            <Permission
              label="Alerts"
              status={permissions.push}
              granted="Allowed. You will be told only when a patient near you needs your blood group — nothing else."
              denied="Not allowed. Requests still appear in the app, and our team can call you."
              blocked="Turned off for Red Express. You can turn them on in your phone settings. Requests still appear in the app."
              disabled="Not available in this build. Requests still appear in the app."
              last
            />

            <AppButton
              title="Open phone settings"
              variant="secondary"
              onPress={() => {
                say('Opening your phone settings.');
                Linking.openSettings();
              }}
              accessibilityHint="Opens the Red Express permissions on your phone, where location and alerts can be changed"
              style={styles.action}
            />
          </>
        )}
      </Card>

      {/* --- The other document ------------------------------------------- */}

      <Card title="Terms of use">
        <AppText variant="body" color={colors.text} style={styles.body}>
          This page is the privacy policy. The terms of use cover the rules for using Red
          Express — including that it is completely free and is not a medical service.
        </AppText>

        <AppButton
          title="Read the terms of use"
          variant="secondary"
          onPress={() => router.push('/terms')}
          accessibilityHint="Opens the terms of use"
        />
      </Card>
    </Screen>
  );
}

/**
 * One labelled fact.
 *
 * Grouped into a single accessibility node so a reader says "Your mobile number. This is how
 * you sign in…" as one sentence, rather than making the user swipe twice and hold the label
 * in their head while the detail is read.
 */
function Item({ label, detail, last = false }) {
  return (
    <View
      style={last ? undefined : styles.item}
      accessible
      accessibilityLabel={`${label}. ${detail}`}
    >
      <AppText variant="subheading" color={colors.text}>
        {label}
      </AppText>
      <AppText variant="body" color={colors.textMuted} style={styles.detail}>
        {detail}
      </AppText>
    </View>
  );
}

/**
 * A permission and what it currently means for the user.
 *
 * The state is always spelled out in words — "Allowed", "Not allowed" — and never carried by
 * a colour or an icon alone, so it survives being read aloud and being seen by someone who
 * cannot distinguish green from red.
 */
function Permission({ label, status, granted, denied, blocked, disabled, last = false }) {
  const copy = {
    granted,
    denied,
    blocked,
    disabled,
    // 'unsupported' comes back from push on a simulator or in Expo Go; 'error' from either.
    unsupported: disabled,
    error: denied,
  }[status] ?? denied;

  const state = status === 'granted' ? 'Allowed' : 'Not allowed';

  return (
    <View
      style={last ? undefined : styles.item}
      accessible
      accessibilityLabel={`${label}: ${state}. ${copy}`}
    >
      <AppText variant="subheading" color={colors.text}>
        {label}: {state}
      </AppText>
      <AppText variant="body" color={colors.textMuted} style={styles.detail}>
        {copy}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { marginBottom: spacing.lg },
  detail: { marginTop: spacing.xs },
  body: { marginBottom: spacing.lg },
  action: { marginTop: spacing.md },
});
