import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { announce } from './LiveMessage';
import { useHighContrast } from '../hooks/usePreferences';
import { captureCurrentPosition } from '../services/location';
import { hapticSuccess, hapticWarning } from '../services/feedback';
import { colors, spacing, radius } from '../theme';

/**
 * "Use my current location", with the rationale attached.
 *
 * ## Why the rationale is here and not on its own screen
 *
 * Phase 9 called for a permission rationale *screen*. This is the same idea in the place it
 * belongs: the explanation sits directly above the button that triggers the prompt, on the
 * form the user is already filling in.
 *
 * Navigating away mid-form to read a page and come back costs a half-finished form's state,
 * pushes a screen onto the stack that a screen-reader user must then get out of, and
 * separates the explanation from the decision by a screen transition. Pre-permission priming
 * works precisely because the two are adjacent. If it needs to become a screen later, the
 * copy and `services/location.js` move across unchanged.
 *
 * ## Every outcome is spoken
 *
 * Granted, denied, permanently blocked, location services off, or a plain failure — each one
 * announces and renders a sentence saying what will happen instead. The failure mode being
 * avoided is the common one: a blind user presses the button, the OS dialog is dismissed by
 * something they cannot see, and nothing at all is said.
 *
 * Denial is never fatal. The status line always ends by pointing at the typed address, which
 * the backend geocodes.
 */
export function LocationCapture({
  /** `{ latitude, longitude }` or null. */
  value,
  onChange,
  disabled = false,
  style,
}) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null); // { message, tone }
  const contrast = useHighContrast();

  async function capture() {
    if (busy || disabled) return;

    setBusy(true);
    setStatus({ message: 'Getting your location…', tone: 'progress' });
    announce('Getting your location.');

    const result = await captureCurrentPosition();

    if (result.status === 'granted') {
      onChange?.({ latitude: result.coords.latitude, longitude: result.coords.longitude });
      hapticSuccess();
      setStatus({ message: 'Using your current location.', tone: 'success' });
      announce('Location captured. Using your current location.');
    } else {
      onChange?.(null);
      hapticWarning();
      setStatus({ message: result.message, tone: 'warning' });
      announce(result.message);
    }

    setBusy(false);
  }

  function clear() {
    onChange?.(null);
    setStatus({ message: 'Using your typed address.', tone: 'info' });
    announce('Location cleared. Using your typed address.');
  }

  const captured = Boolean(value);

  return (
    <View
      style={[
        styles.container,
        // The panel groups a rationale with the button it belongs to; if its edge is
        // invisible, so is the grouping.
        contrast.on && { borderWidth: 2, borderColor: contrast.borderMuted(colors.borderMuted) },
        style,
      ]}
    >
      <AppText variant="label">Your location</AppText>

      {/* The rationale. Plain language, and it says what happens if you say no — which is
          the part that makes declining a real choice rather than a gamble. */}
      <AppText variant="caption" color={colors.textMuted} style={styles.rationale}>
        Sharing your location lets us tell you when a patient near you needs your blood group,
        and show how far away you are. It is used only for matching, never shared with other
        donors, and you can turn it off later. If you would rather not, we will work out a
        rough position from the address you type above.
      </AppText>

      <View style={styles.actions}>
        <AppButton
          title={captured ? 'Update my location' : 'Use my current location'}
          variant="secondary"
          size="small"
          fullWidth={false}
          loading={busy}
          loadingLabel="Getting your location"
          disabled={disabled}
          onPress={capture}
          accessibilityHint="Asks your phone for your current position. You can say no."
        />
        {captured ? (
          <AppButton
            title="Use my address instead"
            variant="link"
            size="small"
            fullWidth={false}
            onPress={clear}
            accessibilityHint="Discards the captured position and uses your typed address"
          />
        ) : null}
      </View>

      {/* Always mounted so TalkBack is watching the node before the first message lands. */}
      <View accessibilityLiveRegion="polite" style={styles.statusSlot}>
        {status ? (
          <AppText
            variant="caption"
            color={status.tone === 'warning' ? colors.warning : colors.textMuted}
            style={styles.status}
          >
            {/* The tone is carried by a word, not only by colour. */}
            {status.tone === 'warning' ? 'Note. ' : ''}
            {status.message}
          </AppText>
        ) : (
          <AppText variant="caption" color={colors.textMuted} style={styles.status}>
            No location shared yet. Your typed address will be used.
          </AppText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderMuted,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    marginBottom: spacing.lg,
  },
  rationale: { marginTop: spacing.xs },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  statusSlot: { minHeight: spacing.xl },
  status: { marginTop: spacing.sm },
});

export default LocationCapture;
