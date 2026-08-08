/**
 * Blood groups and genders, as the selects want them.
 *
 * ## Labels are spelled out, not symbols
 *
 * The mockups show "A+". A screen reader reads "+" as "plus" if you are lucky and skips it
 * if you are not — and "A plus" versus "A minus" is a one-syllable difference on a field
 * where being wrong is a medical error. So the visible label is "A positive". It is longer,
 * it is unambiguous read aloud, and it is what a nurse would say.
 *
 * The value is the database enum (`A_POS`), which is what `backend/src/validation/common.js`
 * stores. That schema also accepts "A+", so nothing breaks if a future screen wants to send
 * the symbol — but the app has no reason to.
 */

export const BLOOD_GROUP_OPTIONS = [
  { value: 'A_POS', label: 'A positive' },
  { value: 'A_NEG', label: 'A negative' },
  { value: 'B_POS', label: 'B positive' },
  { value: 'B_NEG', label: 'B negative' },
  { value: 'O_POS', label: 'O positive', description: 'Most common in India' },
  { value: 'O_NEG', label: 'O negative', description: 'Universal donor' },
  { value: 'AB_POS', label: 'AB positive', description: 'Universal recipient' },
  { value: 'AB_NEG', label: 'AB negative' },
];

/** `A_POS` -> `A positive`, for reading a stored value back to the user. */
export function bloodGroupLabel(value) {
  return BLOOD_GROUP_OPTIONS.find((option) => option.value === value)?.label ?? value ?? 'Not set';
}

export const GENDER_OPTIONS = [
  { value: 'MALE', label: 'Male' },
  { value: 'FEMALE', label: 'Female' },
  { value: 'OTHER', label: 'Other' },
];

export function genderLabel(value) {
  return GENDER_OPTIONS.find((option) => option.value === value)?.label ?? value ?? 'Not set';
}
