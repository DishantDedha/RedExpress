import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { requestOtp, verifyOtp } from './otpService.js';
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
export async function completePhoneLogin({ phone: rawPhone, code, role }) {
  const phone = normalizePhone(rawPhone);

  const existing = await prisma.user.findUnique({ where: { phone } });
  if (existing?.status === 'BLOCKED') {
    throw ApiError.forbidden('ACCOUNT_BLOCKED', 'This account is blocked. Contact Red Express support.');
  }
  if (existing && (existing.role === 'STAFF' || existing.role === 'ADMIN')) {
    throw ApiError.forbidden(
      'STAFF_MUST_USE_PASSWORD',
      'Staff accounts sign in with email and password on the Red Express dashboard.',
    );
  }

  await verifyOtp(phone, code);

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
