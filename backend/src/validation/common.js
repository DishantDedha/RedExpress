import { z } from 'zod';
import { normalizePhone } from '../utils/phone.js';

/**
 * Building blocks shared by the profile schemas.
 *
 * Everything here has to survive multipart/form-data, where every field arrives as a
 * string — "true", "20.29", "" — so booleans and numbers are coerced deliberately rather
 * than with z.coerce, which would turn the string "false" into true.
 */

/** Trimmed, non-empty string with a field-specific message. */
export function requiredText(label, { min = 1, max = 200 } = {}) {
  return z
    .string({ required_error: `Enter ${label}.`, invalid_type_error: `Enter ${label}.` })
    .trim()
    .min(min, min === 1 ? `Enter ${label}.` : `${label} must be at least ${min} characters.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
}

/** Same, but an empty string is treated as "not provided" instead of a validation error. */
export function optionalText(label, opts) {
  return z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? undefined : value), requiredText(label, opts).optional());
}

/**
 * The mobile blood-group select shows "A+" while the database enum is A_POS. Both are
 * accepted so the client never has to carry a translation table.
 */
export const BLOOD_GROUPS = ['A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'O_POS', 'O_NEG', 'AB_POS', 'AB_NEG'];

export const bloodGroup = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  const normalized = value.trim().toUpperCase().replace(/\s+/g, '');
  if (BLOOD_GROUPS.includes(normalized)) return normalized;
  const match = normalized.match(/^(A|B|AB|O)(\+|-|_?POS(ITIVE)?|_?NEG(ATIVE)?)$/);
  if (!match) return normalized;
  const positive = match[2] === '+' || match[2].includes('POS');
  return `${match[1]}_${positive ? 'POS' : 'NEG'}`;
}, z.enum(BLOOD_GROUPS, { errorMap: () => ({ message: 'Choose a blood group.' }) }));

export const gender = z.preprocess(
  (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
  z.enum(['MALE', 'FEMALE', 'OTHER'], { errorMap: () => ({ message: 'Choose a gender.' }) }),
);

/** Indian postal code. Six digits, never starting at zero. */
export const pincode = z
  .string({ required_error: 'Enter a PIN code.' })
  .trim()
  .regex(/^[1-9]\d{5}$/, 'Enter a valid 6 digit PIN code.');

export const email = z
  .string({ required_error: 'Enter an email address.' })
  .trim()
  .toLowerCase()
  .email('Enter a valid email address.')
  .max(254, 'That email address is too long.');

/**
 * Booleans over multipart: "true"/"1"/"on"/"yes" are true, "false"/"0"/"" are false.
 * A checkbox posted by a form and a JSON boolean must mean the same thing.
 */
export function boolish(message = 'Choose yes or no.') {
  return z.preprocess((value) => {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (['true', '1', 'on', 'yes'].includes(v)) return true;
      if (['false', '0', 'off', 'no', ''].includes(v)) return false;
    }
    return value;
  }, z.boolean({ required_error: message, invalid_type_error: message }));
}

/**
 * Numeric field that also accepts the string form multipart delivers.
 * The range lives inside the preprocess wrapper because z.preprocess returns a
 * ZodEffects, which has no .min()/.max() of its own.
 */
function numeric(label, { min, max, rangeMessage }) {
  return z.preprocess(
    (value) => {
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed === '') return undefined;
        const parsed = Number(trimmed);
        return Number.isNaN(parsed) ? value : parsed;
      }
      return value;
    },
    z
      .number({ required_error: `Enter ${label}.`, invalid_type_error: `${label} must be a number.` })
      .min(min, rangeMessage)
      .max(max, rangeMessage),
  );
}

export const latitude = numeric('a latitude', {
  min: -90,
  max: 90,
  rangeMessage: 'Latitude must be between -90 and 90.',
});

export const longitude = numeric('a longitude', {
  min: -180,
  max: 180,
  rangeMessage: 'Longitude must be between -180 and 180.',
});

/**
 * Calendar date as YYYY-MM-DD (or any ISO timestamp) -> Date at UTC midnight.
 * Storing the day rather than an instant avoids a birth date shifting across the date
 * line when the phone and the server disagree about the timezone.
 */
export function isoDate(label) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.trim() : value),
    z
      .string({ required_error: `Enter ${label}.` })
      .refine((value) => !Number.isNaN(Date.parse(value)), `Enter ${label} as YYYY-MM-DD.`)
      .transform((value) => {
        const parsed = new Date(value);
        return new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()));
      }),
  );
}

export const MIN_DONOR_AGE = 18;
export const MAX_DONOR_AGE = 65;

export function ageInYears(date, now = new Date()) {
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - date.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
}

/** Birth date constrained to the legal donation age range. */
export const dateOfBirth = isoDate('a date of birth')
  .refine((date) => date <= new Date(), 'Date of birth cannot be in the future.')
  .refine((date) => ageInYears(date) >= MIN_DONOR_AGE, `Donors must be at least ${MIN_DONOR_AGE} years old.`)
  .refine((date) => ageInYears(date) <= MAX_DONOR_AGE, `Donors must be ${MAX_DONOR_AGE} years old or younger.`);

export const lastDonationDate = isoDate('the donation date')
  .refine((date) => date <= new Date(), 'A donation date cannot be in the future.')
  .refine((date) => date >= new Date('1990-01-01'), 'Enter a more recent donation date.');

/**
 * A phone number, normalised to E.164 by the schema so services never see two spellings
 * of the same number. normalizePhone throws an ApiError aimed at a field called "phone";
 * that is caught here and re-raised as a zod issue on whichever field this actually is,
 * so the message lands on the right input in the form.
 */
export function phoneNumber(label = 'a mobile number') {
  return z
    .string({ required_error: `Enter ${label}.`, invalid_type_error: `Enter ${label}.` })
    .trim()
    .transform((value, ctx) => {
      try {
        return normalizePhone(value);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err?.fields?.phone ? err.message : 'Enter a valid 10 digit mobile number.',
        });
        return z.NEVER;
      }
    });
}

export const password = z
  .string({ required_error: 'Enter a password.' })
  .min(8, 'Password must be at least 8 characters.')
  .max(128, 'Password must be 128 characters or fewer.');
