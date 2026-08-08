/**
 * Phone-number handling on the client.
 *
 * The backend is the authority — `backend/src/utils/phone.js` normalises to E.164 and is
 * what the database stores. This module exists so a typo is caught before a round-trip and,
 * more importantly, so the number can be *spoken* properly.
 *
 * It deliberately mirrors the backend's rules rather than inventing looser ones: if this
 * accepted something the server rejects, the user would get a server error on a field the
 * app had already told them was fine.
 */

const DEFAULT_DIAL = '91'; // India — matches DEFAULT_PHONE_REGION on the backend.
const NATIONAL_LENGTH = 10;

export function digitsOf(input) {
  return String(input ?? '').replace(/\D/g, '');
}

/**
 * Validates and normalises a typed number to E.164.
 *
 * @returns {{ ok: true, phone: string } | { ok: false, error: string }}
 *          `error` is user-facing copy, in the same plain register the backend uses.
 */
export function normalizePhone(input) {
  const raw = String(input ?? '').trim();
  const digits = digitsOf(raw);

  if (!digits) {
    return { ok: false, error: 'Enter your mobile number.' };
  }

  // Typed with a country code: trust it, within E.164's own limits.
  if (raw.startsWith('+')) {
    if (digits.length < 8 || digits.length > 15) {
      return { ok: false, error: 'Enter a valid number including the country code.' };
    }
    return { ok: true, phone: `+${digits}` };
  }

  let national = digits.replace(/^0+/, ''); // 09876543210 -> 9876543210

  // 919876543210 -> 9876543210, for a country code typed without the plus.
  if (
    national.length === DEFAULT_DIAL.length + NATIONAL_LENGTH &&
    national.startsWith(DEFAULT_DIAL)
  ) {
    national = national.slice(DEFAULT_DIAL.length);
  }

  if (national.length !== NATIONAL_LENGTH) {
    return { ok: false, error: `Enter a ${NATIONAL_LENGTH} digit mobile number.` };
  }

  return { ok: true, phone: `+${DEFAULT_DIAL}${national}` };
}

/** `+917008617451` -> `+91 70086 17451`. Grouping helps everyone proof-read a number. */
export function formatPhoneForDisplay(phone) {
  const value = String(phone ?? '');
  if (!value.startsWith(`+${DEFAULT_DIAL}`)) return value;

  const national = value.slice(DEFAULT_DIAL.length + 1);
  if (national.length !== NATIONAL_LENGTH) return value;

  return `+${DEFAULT_DIAL} ${national.slice(0, 5)} ${national.slice(5)}`;
}

/**
 * `+917008617451` -> `plus 9 1 7 0 0 8 6 1 7 4 5 1`.
 *
 * This is the whole reason the module exists. Handed a bare phone number, TalkBack and
 * VoiceOver read it as a quantity — "seven billion, eight million…" — which tells a blind
 * user nothing about whether the code went to the right number. Separating the digits forces
 * them to be read one at a time, and "plus" is spelled out because a leading "+" is
 * otherwise either skipped or read as "plus sign" depending on verbosity settings.
 *
 * Used for announcements and accessibility labels only. The visible text stays grouped and
 * readable, as `formatPhoneForDisplay` returns it.
 */
export function formatPhoneForSpeech(phone) {
  const value = String(phone ?? '');
  const digits = digitsOf(value);
  const spoken = digits.split('').join(' ');
  return value.startsWith('+') ? `plus ${spoken}` : spoken;
}
