// `/max`, not the default entry point. The default ships "min" metadata, which knows
// lengths but not number types: under it `getType()` is always undefined and 1234567890 —
// an Indian landline range no mobile lives in — validates as a perfectly good number. The
// full metadata is ~145 KB larger, which matters in a phone bundle and not at all in a
// server process, and it is the only build that can tell a landline from a mobile.
import { isValidPhoneNumber, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import { env } from '../config/env.js';
import { ApiError } from './errors.js';

/**
 * Phone numbers are the primary key of the app-user identity, so they must be stored in
 * exactly one shape — otherwise "9876543210" and "+91 98765 43210" become two accounts, two
 * OTP rate-limit buckets, and two halves of one person's donation history.
 *
 * Everything is normalised to E.164 (+<country><subscriber>) before it touches the database.
 *
 * ## Why libphonenumber rather than a regex
 *
 * The hand-rolled version this replaces knew one rule: ten digits, prefix +91. That is
 * roughly true for Indian mobiles and wrong for nearly everything else — it accepted
 * +911234567890 (no such subscriber prefix), landlines, and short codes, and it would have
 * had to grow a table per country the moment Red Express served a second one. libphonenumber
 * carries Google's metadata for every numbering plan, so `isValidPhoneNumber` rejects a
 * well-formed number that no operator could have issued.
 *
 * The strictness matters here specifically: an OTP sent to a number that cannot receive it
 * is a donor who never registers, and it is money spent on an SMS that goes nowhere.
 */

/** Every failure looks the same to the caller: 400 INVALID_PHONE with a field message. */
function invalid(message, fieldMessage) {
  throw ApiError.badRequest('INVALID_PHONE', message, { phone: fieldMessage });
}

/**
 * Normalises any user-typed number to E.164.
 *
 * Accepts, for the default region IN: "9876543210", "09876543210", "+91 98765 43210",
 * "919876543210", "(98765) 43210". Accepts any international number written with a
 * leading +. Rejects landlines and short codes — an OTP has to arrive by SMS.
 *
 * @param {string} input   what the user typed
 * @param {string} region  ISO 3166-1 alpha-2, defaults to DEFAULT_PHONE_REGION
 * @returns {string}       E.164, e.g. "+919876543210"
 */
export function normalizePhone(input, region = env.phone.defaultRegion) {
  const raw = String(input ?? '').trim();

  if (!raw) invalid('Enter a mobile number.', 'Required');

  // Without a leading +, the number is read as national and needs a default region to make
  // sense of. parsePhoneNumberFromString never throws — it returns undefined — so a
  // nonsense string falls through to the same message as a badly formed one.
  const parsed = parsePhoneNumberFromString(raw, region);

  if (!parsed) {
    invalid(
      'That mobile number does not look valid.',
      'Enter a valid mobile number, or include the country code',
    );
  }

  if (!parsed.isValid()) {
    invalid('That mobile number does not look valid.', 'Enter a valid mobile number');
  }

  /**
   * Type is 'MOBILE', 'FIXED_LINE', 'FIXED_LINE_OR_MOBILE', or undefined when the plan's
   * metadata cannot tell them apart. Only a definite landline is refused: rejecting the
   * ambiguous cases would lock out numbering plans where the distinction genuinely does not
   * exist, and the worst case there is one wasted SMS rather than a user who cannot register.
   */
  const type = parsed.getType();
  if (type === 'FIXED_LINE') {
    invalid('Enter a mobile number — we send a verification code by text message.', 'Mobile numbers only');
  }

  return parsed.number; // E.164
}

/**
 * The non-throwing form, for places that want to test a number rather than insist on one —
 * a search filter, say, where an unparseable value should simply match nothing.
 *
 * @returns {string|null} E.164, or null if the input is not a valid number.
 */
export function tryNormalizePhone(input, region = env.phone.defaultRegion) {
  try {
    return normalizePhone(input, region);
  } catch {
    return null;
  }
}

/** True when `input` is a dialable number in `region`. No normalisation, no throwing. */
export function isValidPhone(input, region = env.phone.defaultRegion) {
  const raw = String(input ?? '').trim();
  if (!raw) return false;
  return isValidPhoneNumber(raw, region);
}

/**
 * National format for display — "98765 43210" rather than "+919876543210".
 *
 * Screen readers read a run of twelve digits as one long number; the spaced national form is
 * read in groups, which is how a person would say it aloud. Falls back to the input if it
 * cannot be parsed, so this is always safe to call on stored data.
 */
export function formatPhoneForDisplay(phone, region = env.phone.defaultRegion) {
  const parsed = parsePhoneNumberFromString(String(phone ?? ''), region);
  if (!parsed) return String(phone ?? '');
  // A number from the caller's own country reads better nationally; anything else needs
  // its country code to be dialable at all.
  return parsed.country === region ? parsed.formatNational() : parsed.formatInternational();
}

/**
 * Masks all but the last 4 digits, for log lines and screen-reader friendly copy.
 *
 * Used anywhere a number would otherwise be written down — logs, error messages, the "code
 * sent to …" confirmation. Four digits is enough for someone to recognise their own number
 * and not enough for a leaked log to be a contact list.
 */
export function maskPhone(phone) {
  const value = String(phone ?? '');
  if (value.length <= 4) return value;
  return `${'*'.repeat(value.length - 4)}${value.slice(-4)}`;
}
