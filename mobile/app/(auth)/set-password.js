import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AppButton,
  AppTextInput,
  InitiativeFooter,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { setPassword } from '../../services/auth';
import { hapticError, hapticSuccess } from '../../services/feedback';
import { checkPassword } from '../../utils/form';
import { spacing } from '../../theme';

/**
 * "Set a password" — the landing spot after an OTP verification that proved the phone but
 * left the account without a way to sign back in.
 *
 * Two paths arrive here, both by way of `/phone` and `/otp` first: an account that predates
 * the password requirement, and someone who forgot their password and tapped "Forgot
 * password?" on `/login`. Either way there is already a valid session by the time this screen
 * is reached — `finishPhoneLogin` issues tokens on every successful OTP verify — so this
 * screen only has one job, setting the credential, not re-proving who the caller is.
 *
 * Same accessibility contract as the rest of the auth flow: not auto-focused so the heading is
 * heard first, validation mirrors the backend, errors are announced and focus follows them.
 */
export default function SetPasswordScreen() {
  const router = useRouter();
  const say = useAnnounce();
  const passwordRef = useRef(null);
  const confirmRef = useRef(null);

  const [password, setPasswordValue] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  function fail(field, message) {
    setErrors((current) => ({ ...current, [field]: message }));
    hapticError();
    const ref = field === 'confirmPassword' ? confirmRef : passwordRef;
    setTimeout(() => ref.current?.focusForAccessibility(), 250);
  }

  async function handleSubmit() {
    if (saving) return;

    const passwordError = checkPassword(password, { optional: false });
    if (passwordError) {
      fail('password', passwordError);
      return;
    }
    if (!confirmPassword) {
      fail('confirmPassword', 'Confirm your password.');
      return;
    }
    if (password !== confirmPassword) {
      fail('confirmPassword', 'Passwords do not match.');
      return;
    }

    setErrors({});
    setSaving(true);
    // Not a visible LiveMessage: the button's own loadingLabel already says this on screen,
    // so it is only spoken here for a screen reader, not shown a second time.
    say('Saving your password…');

    try {
      await setPassword({ password, confirmPassword });
      hapticSuccess();
      say('Password set. You are signed in.');
      router.replace('/home');
    } catch (error) {
      setSaving(false);
      fail('confirmPassword', error.message);
    }
  }

  return (
    <Screen
      hero={
        <ScreenHeader
          title="Set a password"
          back
          subtitle="Choose a password so you can sign in without a text message next time."
          tone="brand"
          voicePurpose="Choose a password, at least 8 characters, and enter it again to confirm."
          voiceAction="Save password"
        />
      }
      footer={
        <View>
          <AppButton
            title="Save Password"
            size="large"
            loading={saving}
            loadingLabel="Saving your password"
            onPress={handleSubmit}
            accessibilityHint="Saves your password and signs you in"
          />
          <InitiativeFooter />
        </View>
      }
    >
      <AppTextInput
        ref={passwordRef}
        label="Password"
        required
        value={password}
        onChangeText={(text) => {
          setPasswordValue(text);
          if (errors.password) setErrors((current) => ({ ...current, password: null }));
        }}
        error={errors.password}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        autoCapitalize="none"
        helperText="At least 8 characters."
        returnKeyType="next"
        onSubmitEditing={() => confirmRef.current?.focus?.()}
        autoFocus={false}
        containerStyle={styles.field}
      />

      <AppTextInput
        ref={confirmRef}
        label="Confirm password"
        required
        value={confirmPassword}
        onChangeText={(text) => {
          setConfirmPassword(text);
          if (errors.confirmPassword) setErrors((current) => ({ ...current, confirmPassword: null }));
        }}
        error={errors.confirmPassword}
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        autoCapitalize="none"
        returnKeyType="send"
        onSubmitEditing={handleSubmit}
        containerStyle={styles.field}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.lg },
});
