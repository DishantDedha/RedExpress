import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { normalizePhone } from '../utils/phone.js';
import { requestOtp, verifyOtp } from './otpService.js';
import { verifyWidgetToken } from './msg91Widget.js';
import { issueTokens, signAccessToken, verifyRefreshToken } from './tokenService.js';
import { sendEmail } from './emailService.js';

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
 * `availabilityStatus` is deliberately NOT restored here — see docs/crm-lifecycle.md. Re-verifying
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
    // False for an account that predates the password requirement, or one mid-registration
    // that hasn't reached the Security section yet. The app uses this to route to a
    // "set a password" screen instead of home — OTP alone no longer signs anyone back in.
    passwordSet: Boolean(user.passwordHash),
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

/**
 * Sign-in with phone + password — the everyday way in for donors and receivers now. OTP is
 * reserved for proving the phone number itself: once at registration, and again if staff
 * mark the account unreachable.
 *
 * Checks run in an order that always favours sending the caller back through OTP over a
 * password prompt they cannot satisfy: BLOCKED and DEAD are rejected before the password is
 * even considered, and a correct password does not overrule either — see docs/crm-lifecycle.md
 * for why the DEAD case is a deliberate re-verification, not just a login failure. A missing
 * passwordHash (an account that predates this requirement) gets its own code so the app can
 * route to "verify your number, then set a password" instead of a dead-end "wrong password".
 */
export async function loginWithPassword({ phone: rawPhone, password }) {
  const phone = normalizePhone(rawPhone);
  const user = await prisma.user.findUnique({ where: { phone } });

  // Compared against something even when there is no user or no stored hash, so the
  // response time does not itself reveal which case applies.
  const passwordHash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const passwordOk = await bcrypt.compare(password, passwordHash);

  if (!user || (user.role !== 'DONOR' && user.role !== 'RECEIVER')) {
    throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Mobile number or password is incorrect.');
  }

  if (user.status === 'BLOCKED') {
    throw ApiError.forbidden('ACCOUNT_BLOCKED', 'This account is blocked. Contact Red Express support.');
  }

  if (user.status === 'DEAD') {
    throw ApiError.forbidden(
      'PHONE_REVERIFICATION_REQUIRED',
      'Please verify your mobile number again to continue.',
    );
  }

  if (!user.passwordHash) {
    throw ApiError.forbidden(
      'PASSWORD_NOT_SET',
      'Verify your mobile number to set a password for this account.',
    );
  }

  if (!passwordOk) {
    throw ApiError.unauthorized('INVALID_CREDENTIALS', 'Mobile number or password is incorrect.');
  }

  return { ...issueTokens(user), user: publicUser(user) };
}

/**
 * Sets the password on the caller's own, already-authenticated account.
 *
 * There is no "current password" check: reaching this endpoint at all already required a
 * valid access token, and for the two callers that use it — a just-registered account and one
 * that just re-verified its phone after PASSWORD_NOT_SET — proving the phone *is* the proof of
 * ownership. Existing sessions are left alone; unlike a reset, this is not recovering from a
 * lost credential, so there is nothing to invalidate.
 */
export async function setPassword(user, { password }) {
  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });

  return {
    user: publicUser(updated),
    message: 'Password set. You can now sign in with your mobile number and password.',
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

// ---------------------------------------------------------------------------
// Staff password reset
// ---------------------------------------------------------------------------

/**
 * Staff and admin only. App users who lose a password re-verify their phone and use
 * `setPassword` above instead — a mailed reset link makes no sense for an account whose
 * only contact detail is the phone number that already proves who they are.
 * A raw token is emailed; only its SHA-256 hash is stored, the same "never store the secret
 * itself" rule OtpCode follows for codes.
 */
function hashResetToken(rawToken) {
  return crypto.createHash('sha256').update(rawToken).digest('hex');
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60_000);
}

/**
 * Starts a reset. Always resolves the same way whether or not the email belongs to a staff
 * account — a different response would let anyone probe which emails have dashboard access.
 */
export async function requestPasswordReset(rawEmail) {
  const email = rawEmail.toLowerCase();
  const user = await prisma.user.findUnique({ where: { email } });

  const eligible = user && (user.role === 'STAFF' || user.role === 'ADMIN') && user.status === 'ACTIVE';

  if (eligible) {
    const rawToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = minutesFromNow(env.passwordReset.expiryMinutes);

    // Retire any still-live token for this account first, so an old email link cannot be
    // used once a newer one has been requested.
    await prisma.$transaction([
      prisma.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      }),
      prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt } }),
    ]);

    const link = `${env.crm.baseUrl}/reset-password?token=${rawToken}`;

    await sendEmail({
      to: user.email,
      subject: 'Reset your Red Express dashboard password',
      text: [
        `Hello ${user.name || 'there'},`,
        '',
        'Someone requested a password reset for your Red Express staff dashboard account.',
        `If this was you, set a new password here: ${link}`,
        '',
        `This link expires in ${env.passwordReset.expiryMinutes} minutes and can only be used once.`,
        'If you did not request this, you can ignore this email — your password has not changed.',
      ].join('\n'),
    }).catch((err) => {
      // Do not let a mail-provider outage turn into "which emails are staff" via a 502 vs
      // 200 split. Logged for us; the caller still gets the same generic success.
      console.error('[auth] password reset email failed:', err.message);
    });
  }

  return {
    message: 'If that email address has a Red Express dashboard account, a reset link is on its way.',
  };
}

/** Completes a reset: verifies the token, sets the new password, ends every existing session. */
export async function resetPassword({ token, password }) {
  const tokenHash = hashResetToken(token);

  const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt <= new Date()) {
    throw ApiError.badRequest(
      'RESET_TOKEN_INVALID',
      'That reset link is invalid or has expired. Request a new one.',
    );
  }

  const passwordHash = await bcrypt.hash(password, env.bcryptRounds);

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: record.userId },
      // tokenVersion bumps so a password reset also ends every session the account
      // currently holds — the same reasoning as marking a donor unreachable.
      data: { passwordHash, tokenVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    return updated;
  });

  return { ...issueTokens(user), user: publicUser(user), message: 'Your password has been changed. You are signed in.' };
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
