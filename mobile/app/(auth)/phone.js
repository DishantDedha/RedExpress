import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppButton,
  AppTextInput,
  InitiativeFooter,
  LiveMessage,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { api } from '../../services/apiClient';
import { requestOtp } from '../../services/auth';
import { hapticError } from '../../services/feedback';
import { SESSION_END_REASONS } from '../../services/sessionEvents';
import { formatPhoneForSpeech, normalizePhone } from '../../utils/phone';
import { spacing } from '../../theme';

/**
 * "Your mobile number" — mockups 5 and 9. One screen for every reason a phone number needs
 * proving: registering (`mode=register`), an account staff marked unreachable
 * (`mode=reactivate`), and setting a password on an account that does not have a usable one,
 * whether it never had one or the owner forgot it (`mode=set-password`).
 *
 * Signing in day to day no longer touches this screen at all — that is `/login`, phone and
 * password, no code. This one is reached only when a code is genuinely the thing needed next,
 * and the three cases differ by a sentence of copy and by what happens after the code is
 * verified, which is a parameter, not three separate screens. `mode` and `role` ride through
 * to `/otp`.
 *
 * The title sits on a red band and the field sits on white below it. That is not only for
 * looks: a text input on a saturated background has to invert its outline, its label and its
 * helper text, and every one of those is a pair that has to be measured separately. On white
 * the field is the same field as everywhere else in the app.
 *
 * ## Accessibility decisions on this screen
 *
 * **The field is not auto-focused.** Auto-focus is the obvious convenience, and it fights
 * the heading focus: the keyboard opens, the reader is dragged to the field, and the user
 * never hears the screen's name or what the number is for. `ScreenHeader` wins that contest
 * on purpose. Everyone pays one extra tap; a blind user gets to know where they are.
 *
 * **Every state change is spoken.** "Sending code" while the request is in flight, the
 * confirmation on success, the reason on failure. A sighted user sees a spinner and then a
 * new screen; without these, a screen-reader user gets silence and then, abruptly, a
 * different screen.
 *
 * **The number is read digit by digit.** "One time password sent to 7 0 0 8 …" — announcing
 * the raw string makes VoiceOver read it as a single enormous quantity, which cannot be
 * checked against the phone in your hand. See `utils/phone.js`.
 *
 * **Validation happens before the request.** The rules mirror the backend's exactly, so the
 * user is never told a number is fine and then told by the server that it is not.
 */
const PHONE_MODE_SUBTITLES = {
  register: 'We will send a one time password to confirm this is your number.',
  reactivate:
    'Your account needs your phone verified again before you can sign in. We will send a one time password.',
  'set-password':
    'We will send a one time password to confirm this is your number, then you can set a password.',
};

export default function PhoneScreen() {
  const router = useRouter();
  const say = useAnnounce();
  const inputRef = useRef(null);

  const { mode = 'reactivate', role = 'DONOR', notice, reason } = useLocalSearchParams();

  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState(null);
  const [sending, setSending] = useState(false);

  // Render's free tier sleeps the backend after idle. In the widget flow (real builds only —
  // Expo Go can't load the native module) the OTP send never touches our backend at all, so
  // nothing wakes it until /otp/widget-verify, by which point the user has already typed
  // their code and the cold start blows the request timeout. Firing this the moment the
  // screen mounts gives the backend the whole "read the SMS and type it in" window to wake
  // up instead. Errors are irrelevant — this exists purely for its side effect.
  useEffect(() => {
    api.get('/health', { auth: false }).catch(() => {});
  }, []);

  // A forced sign-out lands here with an explanation attached (see app/_layout.js). Being
  // marked unreachable is recoverable and reads as a warning; a block is not.
  const signedOutNotice = notice ? String(notice) : null;
  const noticeTone = reason === SESSION_END_REASONS.BLOCKED ? 'error' : 'warning';

  function fail(message) {
    setFieldError(message);
    hapticError();

    // The error is announced by the field's own live region; this moves the reader's cursor
    // to where the fix has to happen, rather than leaving it on the button.
    //
    // Deferred, and that matters: `AppTextInput` folds the error into its accessible name,
    // so focusing in this tick — before the state has rendered — lands on the *old* name and
    // the error is not read out on arrival.
    setTimeout(() => inputRef.current?.focusForAccessibility(), 250);
  }

  async function handleSend() {
    if (sending) return;

    const result = normalizePhone(value);
    if (!result.ok) {
      fail(result.error);
      return;
    }

    setFieldError(null);
    setSending(true);
    // Not a visible LiveMessage: the button's own loadingLabel already says this on screen,
    // so it is only spoken here for a screen reader, not shown a second time.
    say('Sending code…');

    try {
      const response = await requestOtp(result.phone);

      // The server's normalised number, not the typed one, so both calls agree on which
      // number is being verified.
      const phone = response.phone ?? result.phone;

      say(`One time password sent to ${formatPhoneForSpeech(phone)}`);

      router.push({
        pathname: '/otp',
        params: {
          mode,
          role,
          phone,
          expiresInSeconds: String(response.expiresInSeconds ?? 300),
          // Present only when the backend is running the console SMS provider outside
          // production, so the flow is testable without a live SMS gateway.
          ...(response.devCode ? { devCode: response.devCode } : {}),
        },
      });
    } catch (error) {
      // The backend writes these messages in plain language and they are safe to show —
      // "Too many code requests. Please wait 15 minutes and try again." is far more use
      // than a generic failure.
      fail(error.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <Screen
      hero={
        <ScreenHeader
          title="Your mobile number"
          back
          subtitle={PHONE_MODE_SUBTITLES[mode] ?? PHONE_MODE_SUBTITLES.reactivate}
          tone="brand"
          voicePurpose="Enter your ten digit mobile number. We will text you a one time password."
          voiceAction="Send one time password"
        />
      }
      footer={
        <View>
          <AppButton
            title="Send OTP"
            size="large"
            loading={sending}
            loadingLabel="Sending code"
            onPress={handleSend}
            accessibilityLabel="Send one time password"
            accessibilityHint="Sends a code by text message and opens the verification screen"
          />
          <InitiativeFooter />
        </View>
      }
    >
      {signedOutNotice ? <LiveMessage message={signedOutNotice} tone={noticeTone} /> : null}

      <AppTextInput
        ref={inputRef}
        label="Mobile number"
        required
        value={value}
        onChangeText={(text) => {
          setValue(text);
          if (fieldError) setFieldError(null);
        }}
        error={fieldError}
        helperText="10 digit number. We will send you a one time password."
        keyboardType="phone-pad"
        inputMode="tel"
        autoComplete="tel"
        textContentType="telephoneNumber"
        maxLength={16}
        returnKeyType="send"
        onSubmitEditing={handleSend}
        // Deliberately not auto-focused — see the note at the top of this file.
        autoFocus={false}
        containerStyle={styles.field}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.lg },
});
