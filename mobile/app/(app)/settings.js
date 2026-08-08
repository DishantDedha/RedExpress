import { useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import {
  AppButton,
  AppSwitch,
  AppText,
  Card,
  LiveMessage,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { useScreenReaderEnabled } from '../../hooks/useAccessibilityFocus';
import { usePreferences } from '../../hooks/usePreferences';
import { speak } from '../../services/voiceGuidance';
import { voiceInputStatus } from '../../services/voiceInput';
import { colors, spacing } from '../../theme';

/**
 * Accessibility settings.
 *
 * ## Why these exist when the OS already has them
 *
 * Both platforms have a text-size slider, a high-contrast mode and a screen reader, and this
 * app respects all three. These are not replacements. They exist because:
 *
 *   - the OS settings are five screens deep in a system menu that a user who cannot read the
 *     current text size cannot navigate to;
 *   - they are system-wide, and on a phone shared between a family, changing them changes the
 *     phone for everyone;
 *   - voice guidance has no OS equivalent at all for a user with no screen reader configured.
 *
 * ## Every toggle confirms itself in its own medium
 *
 * Turn big text on and the screen redraws larger — that is the confirmation. Turn voice
 * guidance on and it *speaks*, immediately, so the user hears the thing they just asked for
 * rather than being told in text that it is now on. A setting whose only feedback is a knob
 * moving is a setting a blind user cannot verify.
 */
export default function AccessibilitySettingsScreen() {
  const { preferences, set, reset } = usePreferences();
  const say = useAnnounce();
  const screenReaderOn = useScreenReaderEnabled();
  const [notice, setNotice] = useState(null);

  const dictation = voiceInputStatus();

  function toggleVoiceGuidance(next) {
    set('voiceGuidance', next);

    if (!next) {
      say('Voice guidance is off.');
      return;
    }

    if (screenReaderOn) {
      // Honest rather than silently useless: with a reader running, `speak` is a no-op by
      // design, and a user who turned this on and heard nothing would reasonably conclude the
      // app was broken.
      say(
        'Voice guidance is on. Your screen reader is also running, so Red Express will stay quiet and let it do the talking. Turn the screen reader off to hear Red Express read screens aloud.',
      );
      return;
    }

    // Demonstrates itself. `speak` bypasses the announcement queue so this is heard the moment
    // the switch flips, which is the confirmation.
    speak(
      'Voice guidance is on. Red Express will tell you what each screen is for, and read out confirmations and errors.',
    );
  }

  function toggleBigText(next) {
    set('bigText', next);
    say(next ? 'Big text is on. Everything is about a third larger.' : 'Big text is off.');
  }

  function toggleHighContrast(next) {
    set('highContrast', next);
    say(
      next
        ? 'High contrast is on. Text is darker, buttons are larger, and outlines are stronger.'
        : 'High contrast is off.',
    );
  }

  function restoreDefaults() {
    reset();
    setNotice('All accessibility settings are back to their defaults.');
    say('All accessibility settings are back to their defaults.');
  }

  return (
    <Screen>
      <ScreenHeader
        title="Accessibility"
        subtitle="How Red Express looks and sounds. These settings are remembered."
        voicePurpose="Change how Red Express looks and sounds."
        voiceAction="Turn any setting on or off"
      />

      <LiveMessage message={notice} tone="success" />

      {/* --- Voice ---------------------------------------------------------- */}

      <Card title="Voice guidance">
        <AppSwitch
          label="Read screens aloud"
          value={preferences.voiceGuidance}
          onValueChange={toggleVoiceGuidance}
          onText="Red Express reads out what each screen is for, and speaks confirmations and errors."
          offText="Red Express does not speak."
          accessibilityHint="Uses your phone's text to speech voice. Works whether or not a screen reader is running."
        />

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          {screenReaderOn
            ? 'Your screen reader is running. Red Express will stay quiet while it is on, so the two do not talk over each other — your screen reader already reads everything aloud.'
            : 'No screen reader is running. With this on, Red Express speaks screen descriptions and every confirmation and error itself.'}
        </AppText>
      </Card>

      {/* --- Reading -------------------------------------------------------- */}

      <Card title="Reading">
        <AppSwitch
          label="Big text"
          value={preferences.bigText}
          onValueChange={toggleBigText}
          onText="Everything is about a third larger than usual."
          offText="Text follows your phone's own text size setting."
          accessibilityHint="Makes all text larger, on top of your phone's own text size setting"
        />

        <AppSwitch
          label="High contrast"
          value={preferences.highContrast}
          onValueChange={toggleHighContrast}
          onText="Darker text, stronger outlines, larger buttons."
          offText="Standard colours."
          accessibilityHint="Removes the lighter greys and gives every button and field a strong outline"
          style={styles.secondSwitch}
        />

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          Your phone's own text size setting is always followed as well. Big text is applied on
          top of it, so both together can be very large — every screen in Red Express scrolls
          and wraps rather than cutting text off.
        </AppText>
      </Card>

      {/* --- Dictation ------------------------------------------------------ */}

      <Card title="Speaking instead of typing">
        {dictation.available ? (
          <AppSwitch
            label="Dictation"
            value={preferences.voiceInput}
            onValueChange={(next) => {
              set('voiceInput', next);
              say(
                next
                  ? 'Dictation is on. Long fields on the donor form now offer a speak button.'
                  : 'Dictation is off.',
              );
            }}
            onText="Long fields offer a speak button, so you can say your address instead of typing it."
            offText="All fields are typed."
            accessibilityHint="Adds a speak button under the name and address fields. You can always type instead."
          />
        ) : (
          <AppText variant="body" color={colors.text}>
            {dictation.reason} Every field can be typed, and your phone's own keyboard dictation
            works in Red Express as it does anywhere else.
          </AppText>
        )}
      </Card>

      {/* --- The OS settings ------------------------------------------------ */}

      <Card title="Your phone's settings">
        <AppText variant="body" color={colors.text} style={styles.body}>
          Red Express follows your phone's text size, bold text, screen reader and reduced
          motion settings. Changing them there changes every app, including this one.
        </AppText>
        <AppButton
          title="Open phone settings"
          variant="secondary"
          onPress={() => {
            say('Opening your phone settings.');
            Linking.openSettings();
          }}
          accessibilityHint="Opens the Red Express settings on your phone"
        />
      </Card>

      <AppButton
        title="Restore default settings"
        variant="link"
        onPress={restoreDefaults}
        accessibilityHint="Turns voice guidance, big text, high contrast and dictation off"
        style={styles.reset}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { marginTop: spacing.md },
  body: { marginBottom: spacing.lg },
  secondSwitch: { marginTop: spacing.md },
  reset: { marginTop: spacing.sm },
});
