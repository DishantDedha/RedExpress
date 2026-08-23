import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { requestOtp, verifyOtp } from './otpService.js';
import { verifyWidgetToken } from './msg91Widget.js';
import { issueTokens, signAccessToken, verifyRefreshToken } from './tokenService.js';

/**
 * Auth use-cases. Routes/controllers stay thin; the rules live here.
 */

/** The shape of a user returned to any client. Never leaks passwordHash. */
export function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    phone: user.phone,
    email: user.email,
    role: user.role,
    status: user.status,
    isPhoneVerified: user.isPhoneVerified,
    createdAt: user.createdAt,
  };
}

export async function startPhoneLogin(rawPhone) {
  const phone = normalizePhone(rawPhone);

  // A blocked number gets no code at all — blocking is administrative and not
  // self-recoverable, unlike DEAD.
  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing?.status === 'BLOCKED') {
    throw ApiError.forbidden('ACCOUNT_BLOCKED', 'This account is blocked. Contact Red Express support.');
  }

  const { expiresAt, code } = await requestOtp(phone);
  return { phone, expiresAt, code };
}

/**
 * Verifies the code and logs the user in, creating the account on first use.
 *
 * `role` (DONOR or RECEIVER) only applies when the account is being created — an
 * existing user keeps the role they already have, so a donor who opens the app through
 * the "Find Blood" entry point is not silently demoted to RECEIVER.
 *
 * DEAD -> ACTIVE happens here: re-verifying the phone is exactly the proof of life the
 * CRM's mark-dead action was asking for. tokenVersion is deliberately NOT touched; the
 * bump already happened when staff marked them dead, and bumping again would invalidate
 * the tokens we are about to hand out.
 *
 * `isAvailable` is deliberately NOT restored here — see docs/crm-lifecycle.md. Re-verifying
 * proves the number reaches them; it does not prove they are free to donate this week, so
 * turning availability back on is the donor's own explicit act.
 */
/**
 * Refuses a sign-in that must not proceed, whatever proved the number.
 *
 * Split out so it can run *before* a code is spent on the OTP path — a staff member typing
 * their number into the app should not burn an SMS to be told they are in the wrong place.
 */
async function assertPhoneMayLogIn(existing) {
  if (existing?.status === 'BLOCKED') {
    throw ApiError.forbidden('ACCOUNT_BLOCKED', 'This account is blocked. Contact Red Express support.');
  }
  if (existing && (existing.role === 'STAFF' || existing.role === 'ADMIN')) {
    throw ApiError.forbidden(
      'STAFF_MUST_USE_PASSWORD',
      'Staff accounts sign in with email and password on the Red Express dashboard.',
    );
  }
}

/**
 * Everything that happens once a number is proven — the account, the revival, the tokens.
 *
 * Shared by both routes in, and deliberately unaware of which one it was: whether the code was
 * checked here against `OtpCode` or by MSG91's widget changes nothing about who this person is
 * or what happens to a donor staff had marked unreachable.
 *
 * @param {string} phone  already normalised, and already proven
 */
async function finishPhoneLogin({ phone, role }) {
  const existing = await prisma.user.findUnique({ where: { phone } });

  // Re-checked rather than assumed: on the widget path this is the first look at the account,
  // because the number is not known until MSG91 hands it back.
  await assertPhoneMayLogIn(existing);

  const revived = existing?.status === 'DEAD';

  const user = await prisma.user.upsert({
    where: { phone },
    // name is filled in during registration (Phase 3); an account can exist before then.
    create: { phone, name: '', role, isPhoneVerified: true, status: 'ACTIVE' },
    update: { isPhoneVerified: true, ...(revived ? { status: 'ACTIVE' } : {}) },
  });

  const isNewUser = !existing;
  const profile = user.role === 'DONOR' ? await prisma.donorProfile.findUnique({ where: { userId: user.id } }) : null;

  return {
    ...issueTokens(user),
    user: publicUser(user),
    isNewUser,
    reactivated: revived,
    // Lets the app route straight to the registration form instead of a half-empty home.
    profileComplete: Boolean(user.name) && (user.role !== 'DONOR' || Boolean(profile)),
  };
}

/**
 * Sign-in with a code this server generated and checks itself.
 *
 * The account lookup happens twice — once here to reject staff and blocked numbers before an
 * OTP is spent, once inside finishPhoneLogin. That is a cheap query traded for not burning a
 * code, and an SMS costs real money.
 */
export async function completePhoneLogin({ phone: rawPhone, code, role }) {
  const phone = normalizePhone(rawPhone);

  await assertPhoneMayLogIn(await prisma.user.findUnique({ where: { phone } }));
  await verifyOtp(phone, code);

  return finishPhoneLogin({ phone, role });
}

/**
 * Sign-in with an MSG91 OTP-widget token.
 *
 * The number is whatever MSG91 says the token belongs to — never one the client supplied
 * alongside it. Accepting a client-supplied number would let anyone verify their own phone and
 * then present that token with a donor's number to be signed in as them. See
 * services/msg91Widget.js.
 */
export async function completeWidgetLogin({ accessToken, role }) {
  let verifiedPhone;
  try {
    verifiedPhone = await verifyWidgetToken(accessToken);
  } catch (error) {
    // Deliberately not echoing MSG91's text to the caller: it is written for developers and
    // sometimes names internal reasons. The log keeps the detail for us.
    console.warn('[auth] widget token rejected:', error.message);
    throw ApiError.unauthorized(
      'OTP_VERIFICATION_FAILED',
      'We could not confirm that code. Please request a new one.',
    );
  }

  return finishPhoneLogin({ phone: normalizePhone(verifiedPhone), role });
}

export async function staffLogin({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // Same error and roughly the same work either way, so the response cannot be used to
  // enumerate which staff emails exist.
  const passwordHash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const passwordOk = await bcrypt.compare(password, passwordHash);

  if (!user || !passwordOk || (user.role !== 'STAFF' && user.role !== 'ADMIN')) {
    throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Email or password is incorrect.');
  }

  if (user.status !== 'ACTIVE') {
    throw ApiError.forbidden('ACCOUNT_INACTIVE', 'This staff account is not active. Contact an administrator.');
  }

  return { ...issueTokens(user), user: publicUser(user) };
}

/**
 * Trades a refresh token for a fresh access token.
 * The refresh token is re-checked against the DB user's tokenVersion, so a donor marked
 * dead cannot quietly refresh their way back in — they must re-verify by OTP.
 */
export async function refreshAccessToken(refreshToken) {
  const payload = verifyRefreshToken(refreshToken);

  const user = await prisma.user.findUnique({ where: { id: payload.sub } });
  if (!user) {
    throw ApiError.unauthorized('INVALID_TOKEN', 'Your session is not valid. Please sign in again.');
  }
  if (payload.tokenVersion !== user.tokenVersion) {
    throw ApiError.unauthorized('TOKEN_VERSION_MISMATCH', 'Your session has ended. Please sign in again.');
  }
  if (user.status === 'BLOCKED') {
    throw ApiError.forbidden('ACCOUNT_BLOCKED', 'This account is blocked. Contact Red Express support.');
  }

  return { accessToken: signAccessToken(user), tokenType: 'Bearer', user: publicUser(user) };
}
