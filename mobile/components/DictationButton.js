import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { announce } from './LiveMessage';
import { usePreference } from '../hooks/usePreferences';
import { hapticSuccess, hapticWarning } from '../services/feedback';
import { listenOnce, stopListening, voiceInputAvailable } from '../services/voiceInput';
import { colors, spacing } from '../theme';

/**
 * "Speak this instead" — dictation for one field.
 *
 * Sits under a long text field on the donor form. Renders **nothing at all** unless the
 * native module is installed, the build flag is on, and the user has switched dictation on,
 * so the flag is not a runtime `if` scattered through the forms: it is one component that
 * knows how to be absent.
 *
 * ## What it announces
 *
 * Recording state is the thing a blind user cannot check by looking at a red dot. So:
 * "Listening" when it starts, the recognised text when it lands, and a plain sentence when it
 * fails. The recognised words are read back rather than silently dropped into the field —
 * speech recognition mishears Indian place names often enough that a user who is told nothing
 * will submit a wrong address without ever knowing.
 *
 * The button is a toggle rather than press-and-hold. Hold-to-talk requires knowing exactly
 * where the button is and keeping a finger on it, which is a gesture that does not survive
 * being unable to see the screen.
 */
export function DictationButton({
  /** What is being dictated, for the label: "address", "full name". */
  fieldLabel,
  /** Called with the recognised text. */
  onResult,
  disabled = false,
  style,
}) {
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState(null);
  // Subscribed rather than read once, so switching dictation on in settings makes the button
  // appear on a form that is already open — the user should not have to back out and return.
  const wanted = usePreference('voiceInput');

  // Stopping on unmount matters: navigating away with the microphone still open leaves it
  // open, which is both a privacy problem and a battery one.
  useEffect(() => () => void stopListening(), []);

  if (!wanted || !voiceInputAvailable()) return null;

  async function toggle() {
    if (listening) {
      await stopListening();
      setListening(false);
      announce('Stopped listening.');
      return;
    }

    setListening(true);
    setHeard(null);
    announce(`Listening. Say your ${fieldLabel}.`);

    const result = await listenOnce();
    setListening(false);

    if (result.ok) {
      hapticSuccess();
      setHeard(result.text);
      onResult?.(result.text);
      // Read back, not just inserted. The user has to be able to catch a misheard word.
      announce(`Heard: ${result.text}. Check it, and edit the field if it is wrong.`);
    } else {
      hapticWarning();
      setHeard(null);
      announce(result.message);
    }
  }

  return (
    <View style={[styles.container, style]}>
      <AppButton
        title={listening ? 'Stop listening' : `Speak your ${fieldLabel}`}
        variant="secondary"
        size="small"
        fullWidth={false}
        disabled={disabled}
        onPress={toggle}
        accessibilityState={{ busy: listening }}
        accessibilityHint={
          listening
            ? 'Stops dictation and keeps what has been recognised so far'
            : `Uses your microphone to fill in the ${fieldLabel}. You can always type instead.`
        }
      />

      {/* Always mounted so TalkBack is watching the node before the first message lands. */}
      <View accessibilityLiveRegion="polite" style={styles.statusSlot}>
        <AppText variant="caption" color={colors.textMuted}>
          {listening
            ? 'Listening…'
            : heard
              ? `Heard: ${heard}. Edit the field above if that is not right.`
              : 'You can type instead if you prefer.'}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: -spacing.md, marginBottom: spacing.lg },
  statusSlot: { minHeight: spacing.xl, marginTop: spacing.xs },
});

export default DictationButton;
