import { Linking } from 'react-native';
import { announce } from '../components/LiveMessage';
import { hapticError } from '../services/feedback';
import { formatPhoneForSpeech } from './phone';

/**
 * Placing a call.
 *
 * The point of a donor list is that someone rings the people on it, so this is the app's
 * most important action and it is one line of platform API — plus the handling that makes
 * it survive contact with a real phone.
 *
 * `tel:` fails on a tablet with no dialler, on a locked-down work profile, and on web. It
 * fails *silently*: `openURL` rejects and nothing happens on screen. A sighted user sees
 * nothing change and taps again; a blind user has no way to tell the difference between a
 * call being placed and a dead button. So every failure is announced and the number is read
 * back digit by digit, which at least leaves the user able to dial it themselves.
 *
 * @returns {Promise<boolean>} whether the dialler opened
 */
export async function callNumber(phone, { name } = {}) {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');

  if (!digits) {
    hapticError();
    announce('No phone number is available for this contact.');
    return false;
  }

  const url = `tel:${digits}`;

  try {
    // Not `canOpenURL` first: on Android it needs a `<queries>` entry to answer truthfully
    // and returns false on perfectly capable phones without one, which would block a call
    // that would have worked. Attempting it and handling the rejection is the honest test.
    await Linking.openURL(url);
    return true;
  } catch {
    hapticError();
    announce(
      `This phone cannot place calls. ${name ? `${name}'s number is` : 'The number is'} ${formatPhoneForSpeech(phone)}.`,
    );
    return false;
  }
}
