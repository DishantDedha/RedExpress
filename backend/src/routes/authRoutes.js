import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authAttemptLimiter, otpRequestLimiter } from '../middleware/rateLimit.js';
import {
  forgotPasswordSchema,
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  resetPasswordSchema,
  staffLoginSchema,
  widgetVerifySchema,
} from '../validation/authSchemas.js';
import {
  forgotPasswordHandler,
  refreshHandler,
  requestOtpHandler,
  resetPasswordHandler,
  sessionHandler,
  staffLoginHandler,
  verifyOtpHandler,
  verifyWidgetHandler,
} from '../controllers/authController.js';

export const authRouter = Router();

// App users — phone + one-time password.
//
// The limiters run before validate() so a malformed body still counts against the ceiling:
// rejecting at validation and *not* counting it would leave a free retry loop for anyone who
// sends garbage. otpService adds a second, per-phone limit on top of the per-IP one here.
authRouter.post('/otp/request', otpRequestLimiter, validate(otpRequestSchema), requestOtpHandler);
authRouter.post('/otp/verify', authAttemptLimiter, validate(otpVerifySchema), verifyOtpHandler);

// The MSG91 OTP-widget route in. Same limiter: MSG91 checks the code, but this endpoint
// still mints our tokens, so it is worth the same ceiling as any other way to obtain them.
authRouter.post(
  '/otp/widget-verify',
  authAttemptLimiter,
  validate(widgetVerifySchema),
  verifyWidgetHandler,
);

// CRM users — email + password. Same limiter as OTP verify: both are "guess until it works".
authRouter.post('/staff/login', authAttemptLimiter, validate(staffLoginSchema), staffLoginHandler);

// Same limiter again: a reset token is a secret worth guessing, same as an OTP or a
// password.
authRouter.post(
  '/staff/forgot-password',
  authAttemptLimiter,
  validate(forgotPasswordSchema),
  forgotPasswordHandler,
);
authRouter.post(
  '/staff/reset-password',
  authAttemptLimiter,
  validate(resetPasswordSchema),
  resetPasswordHandler,
);

// Shared.
authRouter.post('/refresh', validate(refreshSchema), refreshHandler);
authRouter.get('/session', requireAuth, sessionHandler);
