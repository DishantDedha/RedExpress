import { z } from 'zod';
import { password } from './common.js';

/**
 * Request-body shapes for /auth/*. Deeper phone validation (E.164 normalisation) happens
 * in utils/phone.js — zod only guarantees a plausible string arrived.
 */

const phone = z
  .string({ required_error: 'Enter a mobile number.' })
  .trim()
  .min(8, 'Enter a valid mobile number.')
  .max(20, 'Enter a valid mobile number.');

export const otpRequestSchema = z.object({
  phone,
});

export const otpVerifySchema = z.object({
  phone,
  code: z
    .string({ required_error: 'Enter the verification code.' })
    .trim()
    .regex(/^\d{4,8}$/, 'Enter the digits from the message.'),
  // Only used when the account is created; existing users keep their stored role.
  role: z.enum(['DONOR', 'RECEIVER'], {
    errorMap: () => ({ message: 'Choose whether you want to donate or find blood.' }),
  }),
});

/**
 * Sign-in with an MSG91 OTP-widget token.
 *
 * Note what is absent: a phone number. The number is read from MSG91's verification of the
 * token and never from the request, because a client-supplied one would let anyone verify
 * their own phone and then claim a donor's — see services/msg91Widget.js.
 */
export const widgetVerifySchema = z.object({
  accessToken: z
    .string({ required_error: 'Verification could not be completed. Please try again.' })
    .trim()
    .min(1, 'Verification could not be completed. Please try again.')
    // Generous: MSG91 owns this token's format and may change its length. Only long enough to
    // reject an empty or obviously junk value before spending a call on their API.
    .max(4096, 'Verification could not be completed. Please try again.'),
  // Only used when the account is created; existing users keep their stored role.
  role: z.enum(['DONOR', 'RECEIVER'], {
    errorMap: () => ({ message: 'Choose whether you want to donate or find blood.' }),
  }),
});

export const staffLoginSchema = z.object({
  email: z
    .string({ required_error: 'Enter your email address.' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
  password: z.string({ required_error: 'Enter your password.' }).min(1, 'Enter your password.'),
});

export const forgotPasswordSchema = z.object({
  email: z
    .string({ required_error: 'Enter your email address.' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
});

export const resetPasswordSchema = z.object({
  token: z.string({ required_error: 'This reset link is missing its token.' }).trim().min(1, 'This reset link is missing its token.'),
  password,
});

export const refreshSchema = z.object({
  refreshToken: z.string({ required_error: 'Missing refresh token.' }).min(10, 'Missing refresh token.'),
});
