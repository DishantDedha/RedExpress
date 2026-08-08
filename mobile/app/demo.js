import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AppButton,
  AppCheckbox,
  AppDateInput,
  AppSelect,
  AppSwitch,
  AppText,
  AppTextInput,
  Card,
  LiveMessage,
  OtpInput,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../components';
import { useScreenReaderEnabled } from '../hooks/useAccessibilityFocus';
import { usePreferences } from '../hooks/usePreferences';
import { hapticError, hapticSuccess } from '../services/feedback';
import { voiceGuidanceActive } from '../services/voiceGuidance';
import { colors, spacing } from '../theme';

/**
 * The component kit, on one screen.
 *
 * Not a style guide — a test rig. Every behaviour that has to be verified with TalkBack or
 * VoiceOver running is reachable from here: field errors that announce themselves, a
 * combobox that reports its value, a loading button that reports `busy`, live messages in
 * every tone. Turn a screen reader on, work down this screen, and you are testing the
 * guarantees the rest of the app is built on.
 *
 * The manual test steps are written up in mobile/README.md.
 */

const BLOOD_GROUPS = [
  { value: 'A_POS', label: 'A positive' },
  { value: 'A_NEG', label: 'A negative' },
  { value: 'B_POS', label: 'B positive' },
  { value: 'B_NEG', label: 'B negative' },
  { value: 'O_POS', label: 'O positive', description: 'Most common in India' },
  { value: 'O_NEG', label: 'O negative', description: 'Universal donor' },
  { value: 'AB_POS', label: 'AB positive', description: 'Universal recipient' },
  { value: 'AB_NEG', label: 'AB negative' },
];

export default function DemoScreen() {
  const say = useAnnounce();
  const screenReaderOn = useScreenReaderEnabled();
  const { preferences, set } = usePreferences();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [nameError, setNameError] = useState(null);
  const [bloodGroup, setBloodGroup] = useState(null);
  const [status, setStatus] = useState('');
  const [tone, setTone] = useState('info');
  const [loading, setLoading] = useState(false);
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [available, setAvailable] = useState(true);
  const [lastDonation, setLastDonation] = useState(null);

  const nameRef = useRef(null);

  /** Stands in for a form submit: validate, announce, and send focus to what is wrong. */
  function validate() {
    if (name.trim()) {
      setNameError(null);
      setTone('success');
      setStatus('Looks good. Full name is filled in.');
      hapticSuccess();
      return;
    }

    setNameError('Enter your full name.');
    setTone('error');
    setStatus('There is 1 problem with this form.');
    hapticError();
    // The announcement alone would leave a blind user to hunt for the bad field. Focus moves
    // to it, which is the behaviour Phase 9's real forms inherit.
    setTimeout(() => nameRef.current?.focusAll(), 400);
  }

  function fakeRequest() {
    setLoading(true);
    setTone('info');
    setStatus('Sending code…');
    setTimeout(() => {
      setLoading(false);
      setTone('success');
      setStatus('One time password sent to 98765 43210.');
      hapticSuccess();
    }, 1800);
  }

  return (
    <Screen>
      <ScreenHeader
        title="Component kit"
        subtitle="Every accessible building block the app is made from."
        voicePurpose="A test rig for every accessible component in the app."
      />

      {/* One live region for the whole screen, near the top where focus starts. */}
      <LiveMessage message={status} tone={tone} />

      <Card title="Screen reader">
        <AppText variant="body" color={colors.textMuted}>
          {screenReaderOn
            ? 'A screen reader is running. Voice guidance stays quiet while it is on, so the two do not talk over each other.'
            : 'No screen reader detected. Turn on TalkBack or VoiceOver to test this screen properly.'}
        </AppText>
      </Card>

      {/* --- The Phase 11 preferences, live -------------------------------- */}

      <Card title="Accessibility preferences">
        <AppText variant="body" color={colors.textMuted} style={styles.note}>
          The same three switches as the settings screen, here so their effect can be seen
          against every component below at once. They are persisted — turning one on here
          turns it on everywhere.
        </AppText>

        <AppSwitch
          label="Voice guidance"
          value={preferences.voiceGuidance}
          onValueChange={(next) => {
            set('voiceGuidance', next);
            say(next ? 'Voice guidance is on.' : 'Voice guidance is off.');
          }}
          onText={
            voiceGuidanceActive()
              ? 'Speaking. Every message on this screen is now read aloud.'
              : 'On, but silent — a screen reader is running and it does the talking.'
          }
          offText="Red Express does not speak."
        />

        <AppSwitch
          label="Big text"
          value={preferences.bigText}
          onValueChange={(next) => set('bigText', next)}
          onText="Everything below is about a third larger."
          offText="Standard size, following your phone's text setting."
          style={styles.switch}
        />

        <AppSwitch
          label="High contrast"
          value={preferences.highContrast}
          onValueChange={(next) => set('highContrast', next)}
          onText="Muted greys gone, outlines strengthened, buttons larger."
          offText="Standard colours."
          style={styles.switch}
        />

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          With high contrast on, the captions in this card are the same colour as body text —
          that is the point. Hierarchy is carried by size and weight, which survive when
          contrast sensitivity does not.
        </AppText>
      </Card>

      {/* --- Text --------------------------------------------------------- */}

      <Card title="Text">
        <AppText variant="display">Display</AppText>
        <AppText variant="title">Title</AppText>
        <AppText variant="heading">Heading</AppText>
        <AppText variant="subheading">Subheading</AppText>
        <AppText variant="body">Body — the default. Grows with the OS text size setting.</AppText>
        <AppText variant="caption" color={colors.textMuted}>
          Caption — still 6.58 to 1 against white, because muted must not mean unreadable.
        </AppText>
        <AppText variant="body" color={colors.textMuted} style={styles.note}>
          The first four are exposed as headings, so the VoiceOver rotor and TalkBack heading
          navigation can jump between them.
        </AppText>
      </Card>

      {/* --- Buttons ------------------------------------------------------ */}

      <Card title="Buttons">
        <AppButton
          title="Primary action"
          onPress={() => {
            setTone('info');
            setStatus('Primary action pressed.');
          }}
          accessibilityHint="Demonstrates the primary button"
        />
        <View style={styles.gap} />
        <AppButton
          title="Secondary action"
          variant="secondary"
          onPress={() => {
            setTone('info');
            setStatus('Secondary action pressed.');
          }}
        />
        <View style={styles.gap} />
        <AppButton
          title="Destructive action"
          variant="danger"
          onPress={() => {
            setTone('warning');
            setStatus('Destructive action pressed.');
          }}
          accessibilityHint="Nothing is actually deleted"
        />
        <View style={styles.gap} />
        <AppButton
          title="Send one time password"
          loading={loading}
          loadingLabel="Sending code"
          onPress={fakeRequest}
          accessibilityHint="Shows the loading and busy state for one and a half seconds"
        />
        <View style={styles.gap} />
        <AppButton title="Disabled action" disabled onPress={() => {}} />
        <View style={styles.gap} />
        <AppButton
          title="Resend code"
          variant="link"
          size="small"
          onPress={() => say('Code resent')}
        />

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          Every one is at least 48 by 48. The loading button keeps its label and reports
          "busy"; the disabled one reports "dimmed" rather than just looking faded.
        </AppText>
      </Card>

      {/* --- Inputs ------------------------------------------------------- */}

      <Card title="Text inputs">
        <AppTextInput
          ref={nameRef}
          label="Full name"
          required
          value={name}
          onChangeText={setName}
          error={nameError}
          helperText="As it appears on your identity document."
          autoComplete="name"
          textContentType="name"
        />

        <AppTextInput
          label="Mobile number"
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          // An example, not the field name — the label above carries that.
          placeholder="9876543210"
          helperText="We send your one time password here."
          autoComplete="tel"
          textContentType="telephoneNumber"
        />

        <AppTextInput label="Disabled field" value="Cannot be changed" disabled onChangeText={() => {}} />

        <AppButton
          title="Check this form"
          variant="secondary"
          onPress={validate}
          accessibilityHint="Leave the name empty to hear the error announced and focus jump to the field"
        />

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          Labels are visible text, not placeholders — a placeholder disappears as soon as you
          type. Submitting with the name empty announces the error and moves the screen
          reader to the offending field.
        </AppText>
      </Card>

      {/* --- Verification code -------------------------------------------- */}

      <Card title="Verification code">
        <OtpInput
          value={otp}
          onChangeText={(next) => {
            setOtp(next);
            if (otpError) setOtpError(null);
          }}
          error={otpError}
          onComplete={(value) => {
            // Stands in for the real check: 123456 passes, anything else fails, so both
            // paths can be heard without a backend.
            if (value === '123456') {
              setOtpError(null);
              say('Verified');
            } else {
              setOtpError('That code is not correct. Try 123456.');
            }
          }}
        />

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          Six boxes, one field. Swipe to it and the reader announces a single "Verification
          code" field and reads the digits back one at a time — not as one large number. The
          boxes themselves are hidden from the reader; they are a picture of the value.
        </AppText>
      </Card>

      {/* --- Select ------------------------------------------------------- */}

      <Card title="Dropdown">
        <AppSelect
          label="Blood group"
          required
          options={BLOOD_GROUPS}
          value={bloodGroup}
          onChange={setBloodGroup}
          placeholder="Select your blood group"
          helperText="Ask at your last donation if you are not sure."
        />

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          Announced as a combo box with its current value. Options are radio buttons with a
          checked state and an "item 4 of 8" position, so you always know where you are and
          what is already chosen.
        </AppText>
      </Card>

      {/* --- Choices, switches and dates ---------------------------------- */}

      <Card title="Choices and dates">
        <AppCheckbox
          label="I agree to the terms and conditions"
          checked={agreed}
          onChange={setAgreed}
          helperText="A real checkbox, not a tappable square."
        />

        <AppSwitch
          label="Available to donate"
          value={available}
          onValueChange={setAvailable}
          onText="You are shown as available. Patients near you can find you."
          offText="You are shown as not available. You will not appear in searches."
        />

        <AppDateInput
          label="Date of your last donation"
          value={lastDonation}
          onChange={setLastDonation}
          helperText="Three fields, not a spinner — see the note below."
        />

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          The checkbox announces "checkbox, not checked" and reports the change; the switch
          says what on and off actually mean rather than leaving it to the knob position; the
          date is three labelled fields with no auto-advance, because a picker wheel is slow
          to reach a birth year forty years back and interrupts the reader on every column.
        </AppText>
      </Card>

      {/* --- Live messages ------------------------------------------------ */}

      <Card title="Live messages">
        <AppText variant="body" color={colors.textMuted} style={styles.note}>
          Async events a sighted user simply sees. Each of these speaks and appears in the
          region at the top of the screen.
        </AppText>
        <View style={styles.row}>
          <AppButton
            title="Info"
            variant="secondary"
            fullWidth={false}
            onPress={() => {
              setTone('info');
              setStatus('Searching for donors near you.');
            }}
          />
          <AppButton
            title="Success"
            variant="secondary"
            fullWidth={false}
            onPress={() => {
              setTone('success');
              setStatus('3 donors found within 5 kilometres.');
              hapticSuccess();
            }}
          />
        </View>
        <View style={styles.row}>
          <AppButton
            title="Warning"
            variant="secondary"
            fullWidth={false}
            onPress={() => {
              setTone('warning');
              setStatus('Your code expires in 30 seconds.');
            }}
          />
          <AppButton
            title="Error"
            variant="secondary"
            fullWidth={false}
            onPress={() => {
              setTone('error');
              setStatus('That code was not correct. 4 attempts left.');
              hapticError();
            }}
          />
        </View>

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          Each tone is prefixed with a word — "Success", "Error" — so the severity survives
          for anyone who cannot see the colour.
        </AppText>
      </Card>

      {/* --- Cards -------------------------------------------------------- */}

      <Card title="Cards">
        <AppText variant="body" color={colors.textMuted}>
          A plain card is a container and adds nothing to the accessibility tree. The two
          below are the other two modes.
        </AppText>
      </Card>

      <Card
        onPress={() => {
          setTone('info');
          setStatus('Pressable card activated.');
        }}
        accessibilityLabel="Post a blood request"
        accessibilityHint="Opens the request form"
        title="Pressable card"
      >
        <AppText variant="body" color={colors.textMuted}>
          A real button: role, label, hint and a 48dp minimum.
        </AppText>
      </Card>

      <Card
        grouped
        // What a donor search result will sound like in Phase 10.
        accessibilityLabel="Ravi Kumar, O positive, 3.2 kilometres away, available to donate"
        title="Ravi Kumar"
      >
        <AppText variant="body">O positive · 3.2 km away</AppText>
        <AppText variant="body" color={colors.success}>
          Available to donate
        </AppText>
        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          Grouped into one stop, so the name, blood group and distance are heard as one
          result instead of three unconnected fragments.
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  gap: { height: spacing.md },
  switch: { marginTop: spacing.md },
  note: { marginTop: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md, flexWrap: 'wrap' },
});
