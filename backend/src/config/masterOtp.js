/**
 * The demo master OTP: one code that verifies any phone number.
 *
 * ## What this is for
 *
 * India's A2P SMS route requires DLT registration — entity, header and template approval with
 * business KYC — which takes days to weeks. Until that clears, `SMS_PROVIDER=console` sends
 * nothing, and `exposeOtpInResponse` (config/env.js) correctly strips `devCode` from the
 * response under `NODE_ENV=production`. The result is a deployed prototype where the codes
 * exist only in the server log and nobody outside the terminal can sign in. This exists so a
 * client can be handed one code and test the app themselves.
 *
 * ## What it actually is
 *
 * A sign-in bypass. Anyone holding this code can authenticate as any donor whose phone number
 * they know, and those records carry a home address and coordinates. It is not a weakened
 * check — it is the absence of one — so it is fenced by construction rather than by comment:
 *
 *   1. **Off unless asked for.** No `OTP_MASTER_CODE`, no bypass, no code path reached.
 *   2. **Refused alongside a real SMS gateway.** This is the guard that matters. The moment
 *      `SMS_PROVIDER` names a real provider, real donors are receiving real codes — and the
 *      process refuses to start rather than serve them with a bypass still live. Forgetting
 *      to remove it becomes a failed deploy, which is loud, instead of an open door, which
 *      is silent.
 *   3. **Refused if guessable.** `123456`, `000000` and their kin are what anyone tries
 *      first, and this code is entered through a field that invites six digits.
 *
 * It cannot reach staff accounts. `completePhoneLogin` rejects STAFF and ADMIN with
 * `STAFF_MUST_USE_PASSWORD` *before* any code is verified, so the dashboard — the thing that
 * can read every donor's address and mark people dead — is unreachable this way.
 *
 * ## Why exactly OTP_LENGTH digits
 *
 * The app's code field is numeric and capped at `length` (`mobile/components/OtpInput.js`
 * strips non-digits and slices). A master code of any other shape could not physically be
 * typed into the app it exists to unlock, so the wrong length is a configuration error worth
 * catching at boot rather than in a confused client's hands.
 */

/** Codes nobody should be able to choose: all-same digits, or a run up or down the keypad. */
function isGuessable(code) {
  if (/^(\d)\1*$/.test(code)) return true;
  const ascending = '01234567890';
  const descending = '09876543210';
  return ascending.includes(code) || descending.includes(code);
}

/**
 * Validates `OTP_MASTER_CODE` at boot.
 *
 * @param {object} options
 * @param {string|undefined} options.raw          the raw env value
 * @param {number} options.length                 OTP_LENGTH — the app's code field width
 * @param {string} options.smsProvider            the resolved SMS_PROVIDER
 * @returns {string|null} the code, or null when no master code is configured
 * @throws {Error} when a code is set but must not be honoured — the caller is `config/env.js`,
 *         which runs at import, so this crashes the process at boot by design.
 */
export function parseMasterOtpCode({ raw, length, smsProvider }) {
  if (raw === undefined || raw === null || raw.trim() === '') return null;

  const code = raw.trim();

  if (smsProvider !== 'console') {
    throw new Error(
      `OTP_MASTER_CODE is set while SMS_PROVIDER=${smsProvider}. The master code is a sign-in ` +
        'bypass for demos only, and real codes are now being delivered to real people. ' +
        'Unset OTP_MASTER_CODE before deploying with an SMS gateway.',
    );
  }

  if (!new RegExp(`^\\d{${length}}$`).test(code)) {
    throw new Error(
      `OTP_MASTER_CODE must be exactly ${length} digits (OTP_LENGTH). The app's code field ` +
        'accepts nothing else, so any other value could never be entered.',
    );
  }

  if (isGuessable(code)) {
    throw new Error(
      'OTP_MASTER_CODE is a sequence anyone would try first. Generate a random one: ' +
        `node -e "console.log(String(Math.floor(Math.random()*1e${length})).padStart(${length},'0'))"`,
    );
  }

  return code;
}

export default parseMasterOtpCode;
