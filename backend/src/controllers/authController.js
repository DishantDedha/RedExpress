import { exposeOtpInResponse, env } from '../config/env.js';
import { asyncHandler } from '../utils/errors.js';
import { maskPhone } from '../utils/phone.js';
import {
  completePhoneLogin,
  completeWidgetLogin,
  loginWithPassword,
  publicUser,
  refreshAccessToken,
  requestPasswordReset,
  resetPassword,
  setPassword,
  staffLogin,
  startPhoneLogin,
} from '../services/authService.js';

export const requestOtpHandler = asyncHandler(async (req, res) => {
  const { phone, expiresAt, code } = await startPhoneLogin(req.body.phone);

  res.status(200).json({
    // Echoed back normalised so the app can display exactly what it sent the code to.
    phone,
    maskedPhone: maskPhone(phone),
    expiresAt,
    expiresInSeconds: env.otp.expiryMinutes * 60,
    message: `Verification code sent to ${maskPhone(phone)}.`,
    // Development convenience only — never present when SMS actually goes out.
    ...(exposeOtpInResponse ? { devCode: code } : {}),
  });
});

export const verifyOtpHandler = asyncHandler(async (req, res) => {
  const result = await completePhoneLogin(req.body);
  res.status(200).json(result);
});

/**
 * POST /auth/otp/widget-verify
 *
 * The MSG91 OTP-widget route in. The app sends only the access token the widget gave it; the
 * phone number is whatever MSG91 says that token belongs to. The response is identical in
 * shape to /otp/verify, so the app's sign-in handling does not fork.
 */
export const verifyWidgetHandler = asyncHandler(async (req, res) => {
  const result = await completeWidgetLogin(req.body);
  res.status(200).json(result);
});

export const loginHandler = asyncHandler(async (req, res) => {
  const result = await loginWithPassword(req.body);
  res.status(200).json(result);
});

/** POST /auth/password/set — requireAuth has already proven who is asking. */
export const setPasswordHandler = asyncHandler(async (req, res) => {
  const result = await setPassword(req.user, req.body);
  res.status(200).json(result);
});

export const staffLoginHandler = asyncHandler(async (req, res) => {
  const result = await staffLogin(req.body);
  res.status(200).json(result);
});

export const forgotPasswordHandler = asyncHandler(async (req, res) => {
  const result = await requestPasswordReset(req.body.email);
  res.status(200).json(result);
});

export const resetPasswordHandler = asyncHandler(async (req, res) => {
  const result = await resetPassword(req.body);
  res.status(200).json(result);
});

export const refreshHandler = asyncHandler(async (req, res) => {
  const result = await refreshAccessToken(req.body.refreshToken);
  res.status(200).json(result);
});

/** Cheap "is my token still good?" probe — requireAuth has already done the real work. */
export const sessionHandler = asyncHandler(async (req, res) => {
  res.status(200).json({ user: publicUser(req.user) });
});
