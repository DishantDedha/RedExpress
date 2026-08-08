import { Router } from 'express';
import { validate } from '../middleware/validate.js';
import { requireAuth } from '../middleware/auth.js';
import { authAttemptLimiter, otpRequestLimiter } from '../middleware/rateLimit.js';
import {
  otpRequestSchema,
  otpVerifySchema,
  refreshSchema,
  staffLoginSchema,
} from '../validation/authSchemas.js';
import {
  refreshHandler,
  requestOtpHandler,
  sessionHandler,
  staffLoginHandler,
  verifyOtpHandler,
} from '../controllers/authController.js';

export const authRouter = Router();

// App users — phone + one-time password.
//
// The limiters run before validate() so a malformed body still counts against the ceiling:
// rejecting at validation and *not* counting it would leave a free retry loop for anyone who
// sends garbage. otpService adds a second, per-phone limit on top of the per-IP one here.
authRouter.post('/otp/request', otpRequestLimiter, validate(otpRequestSchema), requestOtpHandler);
authRouter.post('/otp/verify', authAttemptLimiter, validate(otpVerifySchema), verifyOtpHandler);

// CRM users — email + password. Same limiter as OTP verify: both are "guess until it works".
authRouter.post('/staff/login', authAttemptLimiter, validate(staffLoginSchema), staffLoginHandler);

// Shared.
authRouter.post('/refresh', validate(refreshSchema), refreshHandler);
authRouter.get('/session', requireAuth, sessionHandler);
