import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppButton,
  AppText,
  InitiativeFooter,
  LiveMessage,
  OtpInput,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { useScreenReaderEnabled } from '../../hooks/useAccessibilityFocus';
import { requestOtp, verifyOtp } from '../../services/auth';
import { hapticError, hapticSuccess } from '../../services/feedback';
import { formatPhoneForDisplay, formatPhoneForSpeech } from '../../utils/phone';
import { colors, spacing } from '../../theme';

/**
 * "Verify phone number" — mockups 4 and 10.
 *
 * The six-box input is a single field; `components/OtpInput.js` explains why at length, and
 * that is the largest accessibility decision on this screen. The rest are here.
 *
 * ## Auto-submit is conditional on the screen reader
 *
 * With no reader running, typing the sixth digit submits immediately: it is what people
 * expect, and it saves hunting for a button.
 *
 * With a reader running it does not, and the Submit button is the only way through. The
 * reason is that a blind user reviews what they typed *after* typing it — swiping back to
 * hear "7 0 0 8 …" and check it. Auto-submit fires during that review, so the screen changes
 * underneath them, or a mistyped code is spent before they had any chance to catch it. The
 * button costs one swipe and returns control over when the code is committed.
 *
 * ## The resend countdown is visible, spoken on demand, and never nags
 *
 * A disabled "Resend" with a silently ticking timer is a dead end without sight: the button
 * says "dimmed" and nothing explains when it will work. So the remaining time is (a) drawn
 * on screen, (b) folded into the button's own accessibility label, so landing on it says
 * "Resend code, dimmed, you can request a new code in 24 seconds", and (c) announced once —
 * only once — at the moment it becomes available.
 *
 * What it deliberately is *not* is a live region. A countdown in a live region announces
 * every tick, which is thirty interruptions that make the screen unusable.
 */

const RESEND_COOLDOWN_SECONDS = 30;

export default function OtpScreen() {
  const router = useRouter();
  const say = useAnnounce();
  const screenReaderOn = useScreenReaderEnabled();
  const codeRef = useRef(null);

  const params = useLocalSearchParams();
  const mode = params.mode ?? 'login';
  const role = params.role ?? 'DONOR';
  const phone = params.phone ? String(params.phone) : '';
  const expiryMinutes = Math.round(Number(params.expiresInSeconds ?? 300) / 60);
  const devCode = params.devCode ? String(params.devCode) : null;

  const [code, setCode] = useState('');
  const [error, setError] = useState(null);
  const [status, setStatus] = useState(null); // { message, tone }
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);

  // Ticks the resend cooldown down to zero, then stops. Plain state, not a live region —
  // see the note above.
  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((n) => n - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  // The single announcement, when waiting is over.
  const announcedReady = useRef(false);
  useEffect(() => {
    if (secondsLeft > 0 || announcedReady.current) return;
    announcedReady.current = true;
    say('You can now request a new code.');
  }, [secondsLeft, say]);

  const handleVerify = useCallback(
    async (submitted) => {
      const value = submitted ?? code;
      if (verifying || value.length !== 6) return;

      setError(null);
      setVerifying(true);
      setStatus({ message: 'Checking your code…', tone: 'progress' });

      try {
        const result = await verifyOtp({ phone, code: value, role, mode });

        hapticSuccess();
        setStatus(null);

        // A donor whose account was set to DEAD by CRM staff has just been brought back by
        // this very verification (the backend flips DEAD to ACTIVE on a successful check).
        // Saying so closes the loop for someone who was signed out mid-task and told only
        // that they had to verify their number again.
        say(
          result.reactivated
            ? 'Verified. Welcome back, you are on the donor list again.'
            : 'Verified.',
        );

        router.replace(result.next);
      } catch (err) {
        hapticError();
        setStatus(null);
        setError(err.message);
        setCode('');
        // Put the reader's cursor back on the field. Without this it stays on the Submit
        // button, and re-entering the code means finding the field again by swipe.
        //
        // Deferred so the error has rendered into the field's accessible name first —
        // focusing in this tick would land on the old name and say nothing about what
        // went wrong.
        setTimeout(() => codeRef.current?.focusForAccessibility(), 250);
      } finally {
        setVerifying(false);
      }
    },
    [code, verifying, phone, role, mode, router, say],
  );

  async function handleResend() {
    if (resending || secondsLeft > 0) return;

    setError(null);
    setResending(true);
    setStatus({ message: 'Sending a new code…', tone: 'progress' });

    try {
      await requestOtp(phone);
      setCode('');
      setSecondsLeft(RESEND_COOLDOWN_SECONDS);
      announcedReady.current = false;
      setStatus({ message: 'A new code has been sent.', tone: 'success' });
      setTimeout(() => codeRef.current?.focusForAccessibility(), 250);
    } catch (err) {
      hapticError();
      setStatus(null);
      // Covers the backend's rate limit — "Too many code requests. Please wait 15 minutes
      // and try again." — which the user genuinely needs to hear rather than a shrug.
      setError(err.message);
    } finally {
      setResending(false);
    }
  }

  const resendLabel = secondsLeft > 0 ? `Resend code, available in ${secondsLeft} seconds` : 'Resend code';

  return (
    <Screen
      hero={
        <>
          <ScreenHeader
            title="Verify phone number"
            subtitle="Enter the one time password we sent you."
            tone="brand"
            voicePurpose="Enter the six digit code we texted you. It may fill in on its own."
            voiceAction="Verify"
          />

          {phone ? (
            <View
              // One stop, one sentence. Split across two elements a reader would say "Please
              // enter the code sent to" and then, separately, a string of digits.
              accessible
              accessibilityLabel={`Code sent to ${formatPhoneForSpeech(phone)}`}
              style={styles.phoneBlock}
            >
              <AppText variant="body" color={colors.onBrandMuted}>
                Please enter the code sent to
              </AppText>
              <AppText variant="heading" color={colors.onPrimary} style={styles.phone}>
                {formatPhoneForDisplay(phone)}
              </AppText>
            </View>
          ) : null}
        </>
      }
      footer={
        <View>
          <AppButton
            title="Submit"
            size="large"
            loading={verifying}
            loadingLabel="Checking your code"
            disabled={code.length !== 6}
            onPress={() => handleVerify()}
            accessibilityLabel="Submit verification code"
            accessibilityHint={
              code.length !== 6
                ? 'Enter all six digits to continue'
                : mode === 'register'
                  ? 'Checks your code and continues to the registration form'
                  : 'Checks your code and signs you in'
            }
          />
          <InitiativeFooter />
        </View>
      }
    >
      <OtpInput
        ref={codeRef}
        value={code}
        onChangeText={(next) => {
          setCode(next);
          if (error) setError(null);
        }}
        error={error}
        editable={!verifying}
        // Focusing the field on mount is what makes iOS offer the code above the keyboard
        // and Android offer it from the notification — autofill needs a focused field. With
        // a reader running, the heading keeps focus instead, so the user is told where they
        // are before being dropped into a text field.
        autoFocus={!screenReaderOn}
        // Auto-submit only when no reader is running. See the note at the top of the file.
        onComplete={screenReaderOn ? undefined : handleVerify}
      />

      <AppText variant="caption" color={colors.textMuted} style={styles.expiry}>
        The code expires in {expiryMinutes} {expiryMinutes === 1 ? 'minute' : 'minutes'}.
      </AppText>

      {devCode ? (
        // Development only: present when the backend runs SMS_PROVIDER=console, so the flow
        // can be exercised without a live SMS gateway.
        <AppText variant="caption" color={colors.info} style={styles.devCode}>
          Development build: your code is {devCode}
        </AppText>
      ) : null}

      <View style={styles.resendRow}>
        <AppButton
          title={secondsLeft > 0 ? `Resend OTP in ${secondsLeft}s` : 'Resend OTP'}
          variant="secondary"
          fullWidth={false}
          loading={resending}
          loadingLabel="Sending a new code"
          disabled={secondsLeft > 0}
          onPress={handleResend}
          accessibilityLabel={resendLabel}
          accessibilityHint={
            secondsLeft > 0
              ? 'You can request another code once the wait is over'
              : 'Sends a new one time password to your mobile number'
          }
        />
      </View>

      <LiveMessage message={status?.message} tone={status?.tone ?? 'info'} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  phoneBlock: { marginTop: spacing.lg },
  phone: { marginTop: spacing.xs },
  expiry: { marginTop: spacing.md },
  devCode: { marginTop: spacing.sm, fontStyle: 'italic' },
  resendRow: { alignItems: 'center', marginTop: spacing.lg },
});
