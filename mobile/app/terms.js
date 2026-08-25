import { Linking, StyleSheet, View } from 'react-native';
import {
  AppButton,
  AppText,
  Card,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../components';
import { config } from '../services/config';
import { colors, spacing } from '../theme';

/**
 * Terms and conditions, in the app.
 *
 * Lives at the root of the route tree — like `demo.js` — rather than under `(app)`, on
 * purpose: the donor and receiver registration forms link here *before* an account exists,
 * and `(app)`'s layout redirects anyone without a session straight to `/login`. A consent
 * document you get bounced away from reading is worse than no document at all.
 *
 * Read alongside `privacy.js`, which the registration checkbox also links to and which is
 * written the same way: ordinary text a screen reader can move through heading by heading,
 * not a web page this app hands off to.
 */
export default function TermsScreen() {
  const say = useAnnounce();

  return (
    <Screen>
      <ScreenHeader
        title="Terms and conditions"
        subtitle="The agreement between you and Red Express. Last updated 25 August 2026."
        voicePurpose="This screen explains the rules for using Red Express, including that it is free and is not a medical service."
        voiceAction="Read the terms, or go back to continue registering"
      />

      <Card title="What Red Express is">
        <Item
          label="A matching service"
          detail="Red Express connects people who need blood with donors nearby, and puts you in touch by phone. It is run by WE4YOU Charitable Trust as a community service."
        />
        <Item
          label="Not a blood bank or hospital"
          detail="We do not collect, test, store or transport blood. The app only exchanges information between people — donation itself always happens at a hospital or blood bank."
          last
        />
      </Card>

      <Card title="Free of charge, always">
        <Item
          label="No fees, ever"
          detail="Registering, searching, matching, calling and receiving alerts all cost nothing. Red Express has no payment feature of any kind — we never take money from you."
        />
        <Item
          label="Blood is never bought or sold"
          detail="You may not use Red Express to pay for a donation or to ask a donor for money. If anyone offers or asks for payment through a connection made here, please refuse and tell us — see Contact us below."
          last
        />
      </Card>

      <Card title="Your account">
        <Item
          label="Give accurate information"
          detail="Your name, blood group, location and other details are what makes a match reliable — and what a patient or our staff acts on in an emergency."
        />
        <Item
          label="Use your own phone number"
          detail="It is how you sign in and how you are reached. A borrowed or false number puts someone else's phone at risk of being called about your account."
          last
        />
      </Card>

      <Card title="If you register as a donor">
        <Item
          label="Willing, not promised"
          detail="Registering means you are open to being contacted about donating. It does not commit you to any particular request — you can decline, and you can turn your availability off at any time on your profile."
        />
        <Item
          label="Eligibility is decided at the blood bank"
          detail="Whether you can actually donate on a given day depends on your health, medication and recent donations. That is always checked by the hospital or blood bank drawing your blood, not by this app."
          last
        />
      </Card>

      <Card title="If you register as a receiver">
        <Item
          label="Keep requests accurate"
          detail="Enter the right blood group, units and urgency, and close the request once it is no longer needed, so donors are not contacted for nothing."
          last
        />
      </Card>

      <Card title="Contacting each other">
        <Item
          label="We share contact details to help you move fast"
          detail="Once matched, a donor's name, blood group and phone number are shown to the receiver, so you can speak directly. Please only use that number for the request at hand."
        />
        <Item
          label="Our staff may call donors too"
          detail="WE4YOU Charitable Trust staff and volunteers sometimes call donors directly to confirm an urgent request. What happened on that call is recorded against the donor's profile, so the same request isn't chased twice."
          last
        />
      </Card>

      <Card title="Rules everyone agrees to">
        <Item label="No fake or duplicate requests" detail="Raising a request that isn't real, or repeating one that's already been answered, wastes a donor's time in an emergency for someone else." />
        <Item label="No harassment" detail="Don't threaten or repeatedly contact someone who has already said no." />
        <Item label="No impersonation" detail="Don't misstate your identity, blood group, or medical eligibility." />
        <Item label="No scraping or reselling contacts" detail="Donor and receiver phone numbers are shared to coordinate one request, not to be collected." />
        <Item
          label="Breaking these rules can mean losing your account"
          detail="We may suspend or remove an account that breaches these rules, provides false information, or otherwise misuses the app."
          last
        />
      </Card>

      <Card title="Not a medical service">
        <Item
          label="Always confirm with a doctor or blood bank"
          detail="Nothing in Red Express is medical advice. Blood group compatibility and a donor's medical suitability must always be checked by a licensed doctor, hospital or accredited blood bank before any donation or transfusion — never treat a match found here as a substitute for that check."
          last
        />
      </Card>

      <Card title="What we can promise, and what we can't">
        <Item
          label="Red Express is provided as is"
          detail="We work to match requests with nearby donors quickly, but we cannot guarantee a donor will be found, will respond, or will attend — or that details a user has entered about themselves are accurate."
        />
        <Item
          label="A free service, and a limited one"
          detail="Because Red Express is a free community service and not a commercial or medical provider, WE4YOU Charitable Trust is not liable for a donor's non-attendance, a user's misrepresentation, or the medical outcome of a donation arranged through the app, to the fullest extent the law allows."
          last
        />
      </Card>

      <Card title="Changes, law, and contact">
        <Item
          label="These terms may change"
          detail="If we update them, the date at the top of this screen changes, and we'll try to let you know in the app for anything significant."
        />
        <Item
          label="Governed by the laws of India"
          detail="Any dispute about these terms is subject to the exclusive jurisdiction of the courts of Bhubaneswar, Odisha."
        />
        <Item
          label="WE4YOU Charitable Trust"
          detail="Registered charitable trust No. 891/2010. Plot No. 1732(3), Near Brindavan Enclave Apartment, Khandagiribari, Bhubaneswar, Odisha – 751030."
          last
        />

        <AppButton
          title="Email us with questions"
          variant="secondary"
          onPress={() => {
            say('Opening your email app.');
            Linking.openURL(
              `mailto:${config.supportEmail}?subject=${encodeURIComponent('Red Express terms and conditions')}`,
            ).catch(() => say(`Could not open your email app. Write to ${config.supportEmail} instead.`));
          }}
          accessibilityHint={`Opens your email app with a message to ${config.supportEmail}`}
          style={styles.action}
        />
      </Card>
    </Screen>
  );
}

/** One labelled clause, read as a single sentence by a screen reader. Matches privacy.js. */
function Item({ label, detail, last = false }) {
  return (
    <View style={last ? undefined : styles.item} accessible accessibilityLabel={`${label}. ${detail}`}>
      <AppText variant="subheading" color={colors.text}>
        {label}
      </AppText>
      <AppText variant="body" color={colors.textMuted} style={styles.detail}>
        {detail}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  item: { marginBottom: spacing.lg },
  detail: { marginTop: spacing.xs },
  action: { marginTop: spacing.md },
});
