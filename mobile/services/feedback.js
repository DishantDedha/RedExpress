import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Haptic feedback — a second, non-visual channel for "that worked" / "that didn't".
 *
 * Useful to everyone in a noisy hospital corridor, and genuinely useful to a blind donor:
 * a buzz confirms the tap registered before the screen reader gets round to saying so.
 *
 * It is only ever a *second* channel. Nothing in this app communicates through haptics
 * alone — every one of these calls sits next to an announcement or a visible message.
 * Vibration is unavailable on web, off by default in some Android accessibility setups, and
 * silently ignored by a user holding the phone flat on a table.
 *
 * Every call is fire-and-forget and swallows its own errors: a device with no haptic motor
 * must never turn a successful registration into a crash.
 */

const supported = Platform.OS === 'ios' || Platform.OS === 'android';

function safely(run) {
  if (!supported) return;
  try {
    run()?.catch?.(() => {});
  } catch {
    // No motor, or the OS refused. Not worth reporting.
  }
}

/** Registration complete, OTP verified, request posted. */
export function hapticSuccess() {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Wrong code, failed validation, network error. */
export function hapticError() {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** Something needs attention but is not a failure — an expiring OTP, a permission prompt. */
export function hapticWarning() {
  safely(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** A control changed state: a switch flipped, an option chosen from a dropdown. */
export function hapticSelection() {
  safely(() => Haptics.selectionAsync());
}

/** A primary button was pressed. Light on purpose — this fires often. */
export function hapticTap() {
  safely(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}
