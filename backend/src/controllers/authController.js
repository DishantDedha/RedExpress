import { exposeOtpInResponse, env } from '../config/env.js';
import { asyncHandler } from '../utils/errors.js';
import { maskPhone } from '../utils/phone.js';
import {
  completePhoneLogin,
  publicUser,
  refreshAccessToken,
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

export const staffLoginHandler = asyncHandler(async (req, res) => {
  const result = await staffLogin(req.body);
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
