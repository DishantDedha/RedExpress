import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { sendSms } from './smsService.js';

/**
 * One-time passwords for app users.
 *
 * Rules enforced here:
 *  - only the bcrypt hash of a code is ever stored (OtpCode.codeHash);
 *  - a code lives OTP_EXPIRY_MINUTES (5) and dies on first successful use;
 *  - requesting a new code retires the previous one, so only the newest text works;
 *  - OTP_REQUESTS_PER_WINDOW (3) codes per phone per OTP_RATE_LIMIT_WINDOW_MINUTES (15);
 *  - OTP_MAX_ATTEMPTS (5) wrong guesses burn the code.
 */

function generateCode(length = env.otp.length) {
  // crypto.randomInt is uniform — Math.random is not, and this is an auth secret.
  const max = 10 ** length;
  return String(crypto.randomInt(0, max)).padStart(length, '0');
}

function minutesFromNow(minutes) {
  return new Date(Date.now() + minutes * 60_000);
}

function otpMessage(code) {
  // Short and plain: this text is read aloud by SMS-reading assistive tech.
  return `${code} is your Red Express verification code. It expires in ${env.otp.expiryMinutes} minutes. Do not share it with anyone.`;
}

/**
 * Creates a code for `phone`, stores its hash, and texts it.
 * Returns { expiresAt, code } — `code` is only populated for the console provider so the
 * route can echo it back in development.
 */
export async function requestOtp(phone) {
  const windowStart = new Date(Date.now() - env.otp.rateLimitWindowMinutes * 60_000);

  const recentCount = await prisma.otpCode.count({
    where: { phone, createdAt: { gte: windowStart } },
  });

  if (recentCount >= env.otp.requestsPerWindow) {
    throw ApiError.tooManyRequests(
      'OTP_RATE_LIMITED',
      `Too many code requests. Please wait ${env.otp.rateLimitWindowMinutes} minutes and try again.`,
    );
  }

  const code = generateCode();
  const codeHash = await bcrypt.hash(code, env.bcryptRounds);
  const expiresAt = minutesFromNow(env.otp.expiryMinutes);

  // Retire any still-live code for this number first, so a user who taps "Resend" can
  // only ever complete with the newest code they received.
  await prisma.$transaction([
    prisma.otpCode.updateMany({
      where: { phone, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    prisma.otpCode.create({ data: { phone, codeHash, expiresAt } }),
  ]);

  await sendSms(phone, otpMessage(code)).catch((err) => {
    console.error('[otp] SMS delivery failed:', err.message);
    throw new ApiError(502, 'SMS_SEND_FAILED', 'We could not send the code right now. Please try again.');
  });

  return { expiresAt, code };
}

/**
 * Checks `code` against the newest live OTP for `phone`.
 * Throws on every failure path; resolves silently when the code is correct and consumed.
 */
export async function verifyOtp(phone, code) {
  const record = await prisma.otpCode.findFirst({
    where: { phone, consumedAt: null },
    orderBy: { createdAt: 'desc' },
  });

  if (!record) {
    throw ApiError.badRequest('OTP_NOT_FOUND', 'Request a new verification code.');
  }

  if (record.expiresAt <= new Date()) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    throw ApiError.badRequest('OTP_EXPIRED', 'That code has expired. Request a new one.');
  }

  if (record.attempts >= env.otp.maxAttempts) {
    await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
    throw ApiError.badRequest('OTP_ATTEMPTS_EXCEEDED', 'Too many incorrect attempts. Request a new code.');
  }

  const matches = await bcrypt.compare(code, record.codeHash);

  if (!matches) {
    const updated = await prisma.otpCode.update({
      where: { id: record.id },
      data: { attempts: { increment: 1 } },
    });
    const remaining = Math.max(env.otp.maxAttempts - updated.attempts, 0);
    throw ApiError.badRequest(
      'OTP_INVALID',
      remaining > 0
        ? `That code is not correct. ${remaining} ${remaining === 1 ? 'attempt' : 'attempts'} remaining.`
        : 'That code is not correct. Request a new code.',
      { code: 'Incorrect code' },
    );
  }

  await prisma.otpCode.update({ where: { id: record.id }, data: { consumedAt: new Date() } });
}
