import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppButton,
  AppText,
  AppTextInput,
  InitiativeFooter,
  LiveMessage,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { loginWithPassword } from '../../services/auth';
import { hapticError, hapticSuccess } from '../../services/feedback';
import { SESSION_END_REASONS } from '../../services/sessionEvents';
import { normalizePhone } from '../../utils/phone';
import { required } from '../../utils/form';
import { colors, spacing } from '../../theme';

/**
 * "Sign in" — phone number and password.
 *
 * Password replaced OTP as the everyday way in (see services/authService.js on the backend
 * for the reasoning); OTP is now reserved for proving a phone number itself, which only
 * happens at registration or when this screen sends someone off to re-verify.
 *
 * Three backend error codes steer the user somewhere other than "try again":
 *
 *   - `PHONE_REVERIFICATION_REQUIRED` — staff marked the account unreachable. The fix is not a
 *     different password, it is proving the number again, so this screen sends them straight
 *     to the OTP flow rather than leaving them to retype a password that will never work.
 *   - `PASSWORD_NOT_SET` — an account that predates the password requirement. Same
 *     destination: verify the phone, then set one.
 *   - `ACCOUNT_BLOCKED` — administrative and not self-recoverable. Shown in place, not routed
 *     anywhere; there is nowhere for this person to go but support.
 *
 * Modelled on `/phone`'s accessibility choices: the field is not auto-focused so the heading
 * is heard first, every state change is spoken, and validation mirrors the backend so nobody
 * is told a value is fine and then told otherwise by the server.
 */
export default function LoginScreen() {
  const router = useRouter();
  const say = useAnnounce();
  const phoneRef = useRef(null);
  const passwordRef = useRef(null);

  const { notice, reason } = useLocalSearchParams();
  const signedOutNotice = notice ? String(notice) : null;
  const noticeTone = reason === SESSION_END_REASONS.BLOCKED ? 'error' : 'warning';

  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [blocked, setBlocked] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  function fail(field, message) {
    setErrors({ [field]: message });
    hapticError();
    const ref = field === 'password' ? passwordRef : phoneRef;
    setTimeout(() => ref.current?.focusForAccessibility(), 250);
  }

  async function handleSignIn() {
    if (signingIn) return;

    const result = normalizePhone(phone);
    if (!result.ok) {
      fail('phone', result.error);
      return;
    }
    const passwordError = required(password, 'Enter your password.');
    if (passwordError) {
      fail('password', passwordError);
      return;
    }

    setErrors({});
    setBlocked(false);
    setSigningIn(true);
    // Not a visible LiveMessage: the button's own loadingLabel already says this on screen,
    // so it is only spoken here for a screen reader, not shown a second time.
    say('Signing you in…');

    try {
      await loginWithPassword({ phone: result.phone, password });
      hapticSuccess();
      say('Signed in.');
      router.replace('/home');
    } catch (error) {
      setSigningIn(false);

      if (error.code === 'PHONE_REVERIFICATION_REQUIRED') {
        hapticError();
        say(error.message);
        router.push({
          pathname: '/phone',
          params: { mode: 'reactivate', notice: error.message },
        });
        return;
      }

      if (error.code === 'PASSWORD_NOT_SET') {
        hapticError();
        say(error.message);
        router.push({
          pathname: '/phone',
          params: { mode: 'set-password', notice: error.message },
        });
        return;
      }

      if (error.code === 'ACCOUNT_BLOCKED') {
        hapticError();
        setBlocked(true);
        say(error.message);
        return;
      }

      // A validation failure *does* name its field — `{ fields: { phone: '…' } }` under the
      // generic "Please check the highlighted fields." Take that when it is there, so a
      // complaint about the number is not shown under the password box.
      const named = ['phone', 'password'].find((name) => error.fields?.[name]);
      if (named) {
        hapticError();
        fail(named, error.fields[named]);
        return;
      }

      // INVALID_CREDENTIALS and anything unexpected: attach to the password field rather than
      // the phone one, since a mistyped phone number and a wrong password read identically to
      // the backend and there is no reason to guess which one is wrong.
      fail('password', error.message);
    }
  }

  return (
    <Screen
      hero={
        <ScreenHeader
          title="Sign in"
          back
          subtitle="Enter your mobile number and password."
          tone="brand"
          voicePurpose="Enter your ten digit mobile number and your password to sign in."
          voiceAction="Sign in"
        />
      }
      footer={
        <View>
          <AppButton
            title="Sign In"
            size="large"
            loading={signingIn}
            loadingLabel="Signing you in"
            disabled={blocked}
            onPress={handleSignIn}
            accessibilityHint="Signs you in with your mobile number and password"
          />
          <InitiativeFooter />
        </View>
      }
    >
      {signedOutNotice ? <LiveMessage message={signedOutNotice} tone={noticeTone} /> : null}

      {blocked ? (
        <LiveMessage
          message="This account is blocked. Contact Red Express support for help."
          tone="error"
        />
      ) : null}

      <AppTextInput
        ref={phoneRef}
        label="Mobile number"
        required
        value={phone}
        onChangeText={(text) => {
          setPhone(text);
          if (errors.phone) setErrors((current) => ({ ...current, phone: null }));
        }}
        error={errors.phone}
        keyboardType="phone-pad"
        inputMode="tel"
        autoComplete="tel"
        textContentType="username"
        maxLength={16}
        returnKeyType="next"
        onSubmitEditing={() => passwordRef.current?.focus?.()}
        autoFocus={false}
        containerStyle={styles.field}
      />

      <AppTextInput
        ref={passwordRef}
        label="Password"
        required
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          if (errors.password) setErrors((current) => ({ ...current, password: null }));
        }}
        error={errors.password}
        secureTextEntry
        autoComplete="current-password"
        textContentType="password"
        autoCapitalize="none"
        returnKeyType="send"
        onSubmitEditing={handleSignIn}
        containerStyle={styles.field}
      />

      <View style={styles.forgot}>
        <AppButton
          title="Forgot password?"
          variant="link"
          size="small"
          fullWidth={false}
          onPress={() =>
            router.push({ pathname: '/phone', params: { mode: 'set-password' } })
          }
          accessibilityHint="Verify your mobile number by text message, then set a new password"
        />
      </View>

      <View style={styles.existing}>
        <AppText variant="body" color={colors.textMuted}>
          New to Red Express?
        </AppText>
        <AppButton
          title="Register"
          variant="link"
          size="small"
          fullWidth={false}
          onPress={() => router.push('/register')}
          accessibilityHint="Create an account as a blood donor or to find blood"
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  field: { marginTop: spacing.lg },
  forgot: { alignItems: 'center', marginTop: spacing.sm },
  existing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
});
