import { useCallback, useState } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { Card } from './Card';
import { LiveMessage, announce } from './LiveMessage';
import { getPushPermissionStatus, registerForPush } from '../services/push';
import { hapticSuccess, hapticWarning } from '../services/feedback';
import { colors, spacing } from '../theme';

/**
 * Asking for notification permission, properly.
 *
 * ## Why this is a card and not an automatic prompt
 *
 * The OS notification dialog appears once per install. Fire it on first launch, before the
 * user knows what the app does, and a large share of people decline out of reflex — and
 * neither platform will ever ask again. For a donor, declining means never hearing that a
 * patient two kilometres away needs their blood group, which is the entire product.
 *
 * So the explanation comes first, in the app, where it can be read at leisure and by a
 * screen reader, and the OS dialog only appears after a deliberate press on a button that
 * says what it will do. Same pre-permission priming as `LocationCapture` in Phase 9.
 *
 * ## Declining is not a dead end
 *
 * Every state below ends by saying what still works without alerts: requests are in the
 * app, and staff phone donors directly (Phase 6). Nobody is locked out of donating for
 * refusing a notification.
 *
 * The state is re-read on every focus rather than cached, because permission can be changed
 * in Settings while the app is backgrounded — a card still offering "Turn on alerts" after
 * the user has already turned them on in Settings is the visible symptom of caching it.
 */
export function PushConsent() {
  const [status, setStatus] = useState(null); // null = still reading
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      (async () => {
        const current = await getPushPermissionStatus();
        if (!active) return;
        setStatus(current);

        // Already granted: register silently. The token can change — an app restore or a
        // reinstall mints a new one — so this runs on every visit rather than once, and the
        // backend upsert makes a repeat call free.
        if (current === 'granted') registerForPush({ prompt: false });
      })();

      return () => {
        active = false;
      };
    }, []),
  );

  async function turnOn() {
    if (busy) return;
    setBusy(true);
    setNote(null);
    announce('Asking for permission to send you alerts.');

    const result = await registerForPush({ prompt: true });
    setStatus(result.status);

    if (result.status === 'granted') {
      hapticSuccess();
      // Said as a consequence rather than a state: "Alerts are on" leaves the user to work
      // out what that means for them.
      announce('Alerts are on. You will be told when someone near you needs your blood group.');
    } else {
      hapticWarning();
      // Rendered into the LiveMessage below rather than announced here — it speaks its own
      // contents, and doing both makes TalkBack say it twice.
      setNote(result.message);
    }

    setBusy(false);
  }

  // Nothing to say once alerts are on, and nothing useful to say on a simulator or in
  // Expo Go — the card would just be an apology taking up the top of the home screen.
  if (status === null || status === 'granted') return null;
  if (status === 'unsupported') {
    return __DEV__ ? (
      <Card title="Alerts are not available in this build">
        <AppText variant="caption" color={colors.textMuted}>
          Push notifications need a development build on a real device. This message is only
          shown in development. See backend/docs/notifications.md.
        </AppText>
      </Card>
    ) : null;
  }

  const blocked = status === 'blocked' || status === 'denied';

  return (
    <Card title={blocked ? 'Alerts are off' : 'Get told when blood is needed nearby'}>
      <AppText variant="body" color={colors.text} style={styles.body}>
        {blocked
          ? 'You will not be told when a patient near you needs your blood group. You can turn alerts on in your phone settings. Blood requests still appear in the app, and our team can call you.'
          : 'We will send you an alert only when a patient near you needs your blood group, with the hospital and how far away it is. No other notifications, and you can turn them off at any time.'}
      </AppText>

      {blocked ? (
        <AppButton
          title="Open phone settings"
          variant="secondary"
          onPress={() => {
            announce('Opening your phone settings.');
            Linking.openSettings();
          }}
          accessibilityHint="Opens the Red Express settings on your phone, where notifications can be turned on"
        />
      ) : (
        <AppButton
          title="Turn on alerts"
          loading={busy}
          loadingLabel="Asking for permission"
          onPress={turnOn}
          accessibilityHint="Asks your phone for permission to send alerts. You can say no."
        />
      )}

      {/* Always mounted, so TalkBack is watching the node before the first message lands. */}
      <LiveMessage message={note} tone="warning" style={styles.note} />
    </Card>
  );
}

const styles = StyleSheet.create({
  body: { marginBottom: spacing.lg },
  note: { marginTop: spacing.sm },
});

export default PushConsent;
