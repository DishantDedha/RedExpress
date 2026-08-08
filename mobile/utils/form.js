/**
 * Form validation plumbing, shared by the registration forms and the profile editor.
 *
 * The accessibility requirement these exist to serve is one line in the phase brief and a
 * lot of detail in practice: *announce the first error and move focus to the first invalid
 * field on submit.*
 *
 * Getting that wrong is the single most common way a long form becomes unusable without
 * sight. The usual failure is to render eleven red messages and announce "there are 11
 * errors" — which tells a blind user that something is wrong and nothing about where. They
 * then swipe the whole form to find them.
 *
 * So: **field order is authoritative.** `validate` walks the rules in the order the fields
 * appear on screen, and `firstErrorField` returns the earliest one in that same order — not
 * whichever key `Object.keys` happens to yield.
 */

/**
 * Runs an ordered list of rules.
 *
 * @param {Array<[string, () => string | null]>} rules  `[fieldName, check]` in screen order.
 *        `check` returns an error message, or null when the field is fine.
 * @returns {{ errors: object, order: string[] }} `order` is the field order, preserved so
 *          the caller does not have to know it separately.
 */
export function validate(rules) {
  const errors = {};
  const order = [];

  for (const [field, check] of rules) {
    order.push(field);
    const message = check();
    if (message) errors[field] = message;
  }

  return { errors, order };
}

/** The earliest field with an error, in screen order. Null when the form is clean. */
export function firstErrorField(errors, order) {
  return order.find((field) => errors[field]) ?? null;
}

/**
 * Announces the outcome and moves the screen reader to the first bad field.
 *
 * The announcement names the field and states the problem — "There is a problem. Blood
 * group. Choose a blood group." — rather than counting errors, because the count is not
 * actionable and the field name is.
 *
 * The focus move is deferred. Every control in the kit folds its error into its accessible
 * name, and that name only exists after React has committed the error state; focusing in the
 * same tick lands on the *old* name and the error goes unread. `refs` holds the imperative
 * handles the kit exposes (`focusAll`), keyed by field name.
 */
export function reportErrors({ errors, order, refs, say, fieldLabels = {}, delayMs = 300 }) {
  const field = firstErrorField(errors, order);
  if (!field) return null;

  const label = fieldLabels[field];
  const message = errors[field];
  const count = Object.keys(errors).length;

  say(
    [
      count === 1 ? 'There is a problem.' : `There are ${count} problems.`,
      label ? `${label}.` : null,
      message,
    ]
      .filter(Boolean)
      .join(' '),
  );

  setTimeout(() => {
    const handle = refs?.[field]?.current;
    // `focusAll` moves the reader cursor and the keyboard together; `focusForAccessibility`
    // is the fallback for controls that cannot take keyboard focus, like the checkbox.
    (handle?.focusAll ?? handle?.focusForAccessibility)?.call(handle);
  }, delayMs);

  return field;
}

/**
 * Maps the backend's `{ error: { fields } }` onto the form's own field names.
 *
 * The two mostly agree — both call it `bloodGroup` — but not always: a duplicate email comes
 * back keyed `email`, while a phone mismatch is keyed `phone` on a form that shows the phone
 * as read-only. Anything unmapped is dropped rather than attached to a field that does not
 * exist, where it would be invisible.
 */
export function fieldErrorsFrom(apiError, knownFields) {
  const fields = apiError?.fields;
  if (!fields) return {};

  const mapped = {};
  for (const [key, message] of Object.entries(fields)) {
    if (knownFields.includes(key)) mapped[key] = String(message);
  }
  return mapped;
}

// ---------------------------------------------------------------------------
// Common field checks
// ---------------------------------------------------------------------------
//
// Deliberately mirroring `backend/src/validation/common.js`. Rules that are looser here mean
// telling someone a value is fine and then having the server disagree; rules that are
// stricter mean rejecting something the server would have accepted. Either is worse than the
// duplication.

export const required = (value, message) => (String(value ?? '').trim() ? null : message);

export function checkEmail(value, { optional = false } = {}) {
  const email = String(value ?? '').trim();
  if (!email) return optional ? null : 'Enter an email address.';
  // Same shape zod's `.email()` accepts, kept simple on purpose: the server is the authority
  // and an over-clever regex here would reject valid addresses.
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) ? null : 'Enter a valid email address.';
}

export function checkPincode(value) {
  const pincode = String(value ?? '').trim();
  if (!pincode) return 'Enter a PIN code.';
  return /^[1-9]\d{5}$/.test(pincode) ? null : 'Enter a valid 6 digit PIN code.';
}

export function checkPassword(value, { optional = true } = {}) {
  const password = String(value ?? '');
  if (!password) return optional ? null : 'Enter a password.';
  if (password.length < 8) return 'Password must be at least 8 characters.';
  if (password.length > 128) return 'Password must be 128 characters or fewer.';
  return null;
}

export const MIN_DONOR_AGE = 18;
export const MAX_DONOR_AGE = 65;

/** Age bounds match `dateOfBirth` in the backend's common schema. */
export function checkDateOfBirth(value, { optional = true } = {}) {
  if (!value) return optional ? null : 'Enter a date of birth.';

  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 'Enter a real date, for example 15 3 1990.';
  if (parsed > new Date()) return 'Date of birth cannot be in the future.';

  const age = ageInYears(parsed);
  if (age < MIN_DONOR_AGE) return `Donors must be at least ${MIN_DONOR_AGE} years old.`;
  if (age > MAX_DONOR_AGE) return `Donors must be ${MAX_DONOR_AGE} years old or younger.`;
  return null;
}

export function checkDonationDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return 'Enter a real date, for example 15 3 2024.';
  if (parsed > new Date()) return 'A donation date cannot be in the future.';
  if (parsed < new Date('1990-01-01')) return 'Enter a more recent donation date.';
  return null;
}

function ageInYears(date, now = new Date()) {
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
}
