import { prisma } from '../config/prisma.js';
import { ApiError, asyncHandler } from '../utils/errors.js';
import { verifyAccessToken } from '../services/tokenService.js';

/**
 * Verifies the bearer access token AND re-reads the user on every request.
 *
 * The DB round-trip is the price of instant revocation: a JWT is valid for 15 minutes,
 * but staff marking a donor dead must take effect on the donor's very next request. The
 * token's tokenVersion claim is compared with the stored one, and a mismatch is a 401
 * with code TOKEN_VERSION_MISMATCH — the signal the mobile app uses to wipe its stored
 * tokens and send the donor back to the OTP screen. See docs/auth.md.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw ApiError.unauthorized('NO_TOKEN', 'Sign in to continue.');
  }

  const payload = verifyAccessToken(token);

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

  req.user = user;
  req.auth = { userId: user.id, role: user.role, tokenVersion: user.tokenVersion };
  next();
});

/**
 * Role gate. Use after requireAuth: requireRole('STAFF', 'ADMIN').
 */
export function requireRole(...roles) {
  const allowed = new Set(roles);
  return (req, res, next) => {
    if (!req.user) {
      next(ApiError.unauthorized('NO_TOKEN', 'Sign in to continue.'));
      return;
    }
    if (!allowed.has(req.user.role)) {
      next(ApiError.forbidden('FORBIDDEN', 'You do not have permission to do that.'));
      return;
    }
    next();
  };
}

/**
 * Some endpoints (donor search from the app) behave differently for a signed-in user but
 * must not 401 an anonymous one. Attaches req.user when a valid token is present and is
 * a no-op otherwise.
 */
export const optionalAuth = asyncHandler(async (req, res, next) => {
  if (!req.headers.authorization) {
    next();
    return;
  }
  try {
    await new Promise((resolve, reject) => {
      requireAuth(req, res, (err) => (err ? reject(err) : resolve()));
    });
  } catch {
    // Ignore bad credentials here; the route simply treats the caller as anonymous.
  }
  next();
});
