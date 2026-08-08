import { z } from 'zod';

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

export const staffLoginSchema = z.object({
  email: z
    .string({ required_error: 'Enter your email address.' })
    .trim()
    .toLowerCase()
    .email('Enter a valid email address.'),
  password: z.string({ required_error: 'Enter your password.' }).min(1, 'Enter your password.'),
});

export const refreshSchema = z.object({
  refreshToken: z.string({ required_error: 'Missing refresh token.' }).min(10, 'Missing refresh token.'),
});
