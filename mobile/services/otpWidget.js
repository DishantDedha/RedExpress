import { config } from './config';
import { logger } from './logger';

/**
 * MSG91's OTP widget — sending and checking the code.
 *
 * ## Why the app talks to MSG91 at all
 *
 * Delivering our own SMS to an Indian number needs a DLT-registered header and an approved
 * content template: weeks of paperwork with a telecom regulator, and MSG91's Sender ID field
 * cannot be filled until it clears. The widget goes around it — MSG91 sends the code from
 * their own pre-approved sender and hands back a signed token proving the number was verified.
 * The backend then exchanges that token for a session (`POST /auth/otp/widget-verify`).
 *
 * ## What is deliberately NOT here
 *
 * MSG91 ships a `DefaultWidget` component that renders its own OTP screen. We do not use it.
 * `components/OtpInput.js` is one accessible field rather than six boxes, announces its digits
 * spaced so "4071" is not read as "four thousand and seventy-one", and works around Android
 * dropping the keyboard request during a screen transition. Handing that to a third party's UI
 * would throw the whole of Phase 8 away and require a fresh screen-reader audit. So this file
 * uses only the three methods MSG91 exposes for custom interfaces.
 *
 * ## Absent is not broken
 *
 * The package is loaded through a guarded `require`, and every entry point reports
 * unavailability rather than throwing. When it is missing — Expo Go, or a build predating the
 * dependency — `services/auth.js` falls back to the backend's own OTP endpoints, which still
 * work and still honour OTP_MASTER_CODE. Development does not stop because a native-adjacent
 * package is not installed.
 */

let widgetModule;
let loadFailed = false;

function widget() {
  if (loadFailed) return null;
  if (!widgetModule) {
    try {
      // eslint-disable-next-line global-require, import/no-extraneous-dependencies
      widgetModule = require('@msg91comm/sendotp-react-native').OTPWidget;
    } catch (error) {
      loadFailed = true;
      logger.warn('[otpWidget] SDK not installed; falling back to backend OTP', error?.message);
      return null;
    }
  }
  return widgetModule;
}

/** True when the widget can actually be used: package present and credentials configured. */
export function widgetAvailable() {
  return Boolean(widget() && config.msg91WidgetId && config.msg91TokenAuth);
}

let initialised = false;
function ensureInitialised() {
  if (initialised) return;
  widget().initializeWidget(config.msg91WidgetId, config.msg91TokenAuth);
  initialised = true;
}

/**
 * MSG91 ties every code to a `reqId` from the send call, so verifying needs the value the
 * send returned. Kept per number rather than in a single slot: going back to change a mistyped
 * number and sending again must not leave the previous request's id behind to be verified
 * against.
 */
const requests = new Map();

/** MSG91 wants the country code but not the plus: +919876543210 -> 919876543210. */
function toIdentifier(phone) {
  return String(phone).replace(/^\+/, '');
}

/** MSG91 answers 200 for a refusal as readily as for a success; `type` is the verdict. */
function unwrap(response, what) {
  if (!response) {
    throw new Error(`MSG91 returned nothing for ${what}.`);
  }
  if (response.type && response.type !== 'success') {
    throw new Error(response.message ?? `MSG91 refused the ${what}.`);
  }
  return response;
}

/**
 * Sends a code and remembers the request it belongs to.
 *
 * @returns {Promise<{ expiresInSeconds: number, alreadyVerified: boolean }>}
 *          `alreadyVerified` is true only when invisible verification completed the whole
 *          thing over the mobile network without a code ever being sent.
 */
export async function sendOtp(phone) {
  ensureInitialised();

  const response = unwrap(
    await widget().sendOTP({ identifier: toIdentifier(phone) }),
    'send',
  );

  // Invisible verification: MSG91 confirmed the number against the mobile network and no code
  // exists to type. The token is kept so verifyOtp can complete the sign-in whatever the user
  // enters — without it they would sit on the code screen waiting for a message that is never
  // coming. If this is ever switched on deliberately, the phone screen should skip ahead
  // instead of showing a code field at all.
  const accessToken = response['access-token'];

  requests.set(phone, { reqId: response.message, accessToken });

  return {
    expiresInSeconds: Number(response.otpExpiry) || 300,
    alreadyVerified: Boolean(accessToken),
  };
}

/**
 * Asks MSG91 for a fresh code on the same request.
 *
 * No channel is passed: the widget runs on its default configuration, and MSG91's own
 * documentation says not to send one in that case.
 */
export async function retryOtp(phone) {
  ensureInitialised();

  const pending = requests.get(phone);
  if (!pending?.reqId) return sendOtp(phone);

  unwrap(await widget().retryOTP({ reqId: pending.reqId }), 'resend');
  return { expiresInSeconds: 300, alreadyVerified: false };
}

/**
 * Checks the code with MSG91 and returns the token the backend can verify.
 *
 * The token is the only thing that crosses to our server — never the phone number. The backend
 * asks MSG91 what the token means, so a number sent alongside it could not be trusted anyway
 * (see backend/src/services/msg91Widget.js).
 *
 * @returns {Promise<string>} the access token
 */
export async function verifyOtp(phone, code) {
  ensureInitialised();

  const pending = requests.get(phone);
  if (!pending) {
    throw new Error('That code has expired. Please request a new one.');
  }

  if (pending.accessToken) return pending.accessToken;

  const response = unwrap(
    await widget().verifyOTP({ reqId: pending.reqId, otp: code }),
    'verification',
  );

  const accessToken = response['access-token'] ?? response.message;
  if (!accessToken) {
    throw new Error('That code is not correct.');
  }

  // Spent: a token is good once, and holding it would let a re-render resubmit it.
  requests.delete(phone);

  return accessToken;
}
