import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

/**
 * JWT minting and verification.
 *
 * Access and refresh tokens are signed with DIFFERENT secrets, and each carries a `typ`
 * claim that is checked on verify, so an access token can never be replayed at
 * /auth/refresh (or vice versa) even if the secrets were ever misconfigured to match.
 *
 * Both token types carry `tokenVersion`. requireAuth compares it against the user row;
 * incrementing User.tokenVersion therefore invalidates every token already issued.
 * See docs/auth.md.
 */

const ACCESS = 'access';
const REFRESH = 'refresh';

function sign(payload, secret, expiresIn) {
  return jwt.sign(payload, secret, { expiresIn, issuer: env.jwt.issuer });
}

export function signAccessToken(user) {
  return sign(
    { sub: user.id, role: user.role, tokenVersion: user.tokenVersion, typ: ACCESS },
    env.jwt.accessSecret,
    env.jwt.accessExpiresIn,
  );
}

export function signRefreshToken(user) {
  return sign(
    { sub: user.id, tokenVersion: user.tokenVersion, typ: REFRESH },
    env.jwt.refreshSecret,
    env.jwt.refreshExpiresIn,
  );
}

export function issueTokens(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
    tokenType: 'Bearer',
    expiresIn: env.jwt.accessExpiresIn,
  };
}

function verify(token, secret, expectedType) {
  let payload;
  try {
    payload = jwt.verify(token, secret, { issuer: env.jwt.issuer });
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('TOKEN_EXPIRED', 'Your session has expired. Please sign in again.');
    }
    throw ApiError.unauthorized('INVALID_TOKEN', 'Your session is not valid. Please sign in again.');
  }

  if (payload.typ !== expectedType) {
    throw ApiError.unauthorized('INVALID_TOKEN', 'Your session is not valid. Please sign in again.');
  }

  return payload;
}

export function verifyAccessToken(token) {
  return verify(token, env.jwt.accessSecret, ACCESS);
}

export function verifyRefreshToken(token) {
  return verify(token, env.jwt.refreshSecret, REFRESH);
}
