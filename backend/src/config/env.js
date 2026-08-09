import 'dotenv/config';
import { parseMasterOtpCode } from './masterOtp.js';

/**
 * Single place that reads process.env, so nothing else in the codebase has to guess
 * defaults or coerce strings. Secrets are validated at boot: a missing JWT secret
 * should crash the process, not silently sign tokens with `undefined`.
 */

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set. Copy the [backend] section of .env.example into backend/.env`);
  }
  return value;
}

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return parsed;
}

function list(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Comma-separated numbers, e.g. MATCH_RADII_KM=5,10,25,50. */
function numberList(name, fallback) {
  const raw = list(name, null);
  if (raw === null) return fallback;
  const numbers = raw.map((part) => {
    const parsed = Number(part);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      throw new Error(`${name} must be a comma-separated list of positive numbers, got "${part}"`);
    }
    return parsed;
  });
  return numbers.length ? numbers : fallback;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  throw new Error(`${name} must be true or false, got "${raw}"`);
}

function oneOf(name, allowed, fallback) {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  if (!allowed.includes(value)) {
    throw new Error(`${name} must be one of ${allowed.join(', ')}, got "${value}"`);
  }
  return value;
}

const port = int('PORT', 4000);
const isProduction = process.env.NODE_ENV === 'production';

// Read ahead of the export: both the OTP block and the master-code validator need it, and the
// validator's error messages quote it.
const otpLength = int('OTP_LENGTH', 6);
const smsProvider = process.env.SMS_PROVIDER ?? 'console';

/**
 * Express's `trust proxy` setting. Behind a load balancer or a platform router the socket
 * address is the proxy's, so every caller would share one rate-limit bucket unless
 * X-Forwarded-For is trusted. Trusting it when there is *no* proxy is the opposite mistake:
 * any client could then spoof its own IP and get a fresh bucket per request. Hence a
 * deliberate, explicit setting — a hop count (1 for one proxy) rather than a blanket `true`.
 */
function trustProxy() {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === '') return false;
  const value = raw.trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(value)) return false;
  if (['true', '1', 'yes', 'on'].includes(value)) return true;
  const hops = Number.parseInt(raw, 10);
  if (!Number.isNaN(hops)) return hops;
  // A named subnet or a comma list of addresses — Express understands both.
  return raw;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProduction,
  port,

  /// Absolute base of this API. Uploaded files are handed to clients as absolute URLs,
  /// so a phone on the LAN can load them without knowing how the server is mounted.
  apiBaseUrl: (process.env.API_BASE_URL ?? `http://localhost:${port}`).replace(/\/+$/, ''),

  trustProxy: trustProxy(),

  bcryptRounds: int('BCRYPT_ROUNDS', 10),

  /**
   * Cross-origin access.
   *
   * The browser client is the CRM and only the CRM, so this is an allow-list, never `*`.
   * The mobile app is not affected either way: React Native's fetch is not a browser and
   * sends no Origin header, so it is unaffected by CORS entirely — locking this down costs
   * the app nothing and stops any other site from driving a staff member's session.
   *
   * In production an empty list is a configuration error, not "allow everything": we fail
   * closed and reject every cross-origin browser request until CORS_ORIGINS is set.
   */
  corsOrigins: list('CORS_ORIGINS', isProduction ? [] : ['http://localhost:3000']),

  /**
   * Request body ceilings. The JSON limit is generous for what any endpoint actually
   * accepts (the largest is a blood request with a note) and exists to stop a 50 MB body
   * being parsed before validation ever sees it. Multipart is capped separately by multer
   * at env.upload.maxBytes.
   */
  bodyLimit: process.env.JSON_BODY_LIMIT ?? '100kb',

  /**
   * IP-level rate limits, layered under the per-phone OTP limit in otpService.
   *
   * The phone limit stops one number being spammed; these stop one host walking a list of
   * numbers, brute-forcing staff passwords, or scraping the donor directory. Disable only
   * in tests — RATE_LIMIT_ENABLED=false — never in production.
   */
  rateLimit: {
    enabled: bool('RATE_LIMIT_ENABLED', true),
    global: {
      windowMs: int('RATE_LIMIT_WINDOW_MS', 60_000),
      limit: int('RATE_LIMIT_MAX', 300),
    },
    // Verifying a code and signing in are the guess-until-it-works endpoints.
    auth: {
      windowMs: int('AUTH_RATE_LIMIT_WINDOW_MS', 15 * 60_000),
      limit: int('AUTH_RATE_LIMIT_MAX', 20),
    },
    // Each of these costs a real SMS, so the ceiling is low and the window long.
    otp: {
      windowMs: int('OTP_IP_RATE_LIMIT_WINDOW_MS', 60 * 60_000),
      limit: int('OTP_IP_RATE_LIMIT_MAX', 15),
    },
    // Search returns donors' names and phone numbers: this is the anti-scraping limit.
    search: {
      windowMs: int('SEARCH_RATE_LIMIT_WINDOW_MS', 60_000),
      limit: int('SEARCH_RATE_LIMIT_MAX', 60),
    },
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '30d',
    issuer: 'red-express',
  },

  otp: {
    length: otpLength,
    expiryMinutes: int('OTP_EXPIRY_MINUTES', 5),
    maxAttempts: int('OTP_MAX_ATTEMPTS', 5),
    requestsPerWindow: int('OTP_REQUESTS_PER_WINDOW', 3),
    rateLimitWindowMinutes: int('OTP_RATE_LIMIT_WINDOW_MINUTES', 15),
    /**
     * One code that verifies any number, for handing to a client before an SMS gateway
     * exists. Null unless OTP_MASTER_CODE is set. See config/masterOtp.js — it is a sign-in
     * bypass, and the rules that stop it outliving the demo live there.
     */
    masterCode: parseMasterOtpCode({
      raw: process.env.OTP_MASTER_CODE,
      length: otpLength,
      smsProvider,
    }),
  },

  phone: {
    defaultRegion: process.env.DEFAULT_PHONE_REGION ?? 'IN',
  },

  /// Profile photo / document uploads. The 2 MB ceiling and the accepted types are the
  /// same ones printed under the upload control in the mobile form, so the client-side
  /// copy and the server-side rule can never drift apart.
  upload: {
    maxBytes: int('MAX_UPLOAD_BYTES', 2 * 1024 * 1024),
    allowedMimeTypes: list('ALLOWED_UPLOAD_MIME', ['image/jpeg', 'image/png', 'application/pdf']),
  },

  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'local',
    localDir: process.env.STORAGE_LOCAL_DIR ?? './uploads',
    /// Path the local driver's files are served from, appended to apiBaseUrl.
    localPublicPath: '/uploads',
    s3: {
      endpoint: process.env.S3_ENDPOINT ?? '',
      region: process.env.S3_REGION ?? '',
      bucket: process.env.S3_BUCKET ?? '',
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
      publicBaseUrl: (process.env.S3_PUBLIC_BASE_URL ?? '').replace(/\/+$/, ''),
    },
  },

  /// Donor search paging. maxCandidateRows caps how many bounding-box survivors are
  /// pulled into memory for the exact Haversine pass — the box is a rectangle around the
  /// circle, so a 50 km radius over a dense city can match a lot of rows, and an
  /// unbounded read is the one way this design can hurt the database.
  search: {
    defaultPageSize: int('SEARCH_DEFAULT_PAGE_SIZE', 20),
    maxPageSize: int('SEARCH_MAX_PAGE_SIZE', 100),
    defaultRadiusKm: int('SEARCH_DEFAULT_RADIUS_KM', 25),
    maxRadiusKm: int('SEARCH_MAX_RADIUS_KM', 500),
    maxCandidateRows: int('SEARCH_MAX_CANDIDATE_ROWS', 2000),
  },

  /// The matching engine. "radius" walks MATCH_RADII_KM outwards until it has
  /// MATCH_MIN_CANDIDATES donors; "area" matches on state/district/city instead.
  /// A request with no coordinates always falls back to "area" whatever this says.
  match: {
    strategy: oneOf('MATCH_STRATEGY', ['radius', 'area'], 'radius'),
    radiiKm: numberList('MATCH_RADII_KM', [5, 10, 25, 50]),
    minCandidates: int('MATCH_MIN_CANDIDATES', 20),
    /// Hard ceiling on RequestMatch rows per request — the last radius step can overshoot
    /// the minimum badly, and every match becomes a push notification in Phase 5.
    maxCandidates: int('MATCH_MAX_CANDIDATES', 100),
  },

  request: {
    defaultExpiryHours: int('REQUEST_DEFAULT_EXPIRY_HOURS', 24),
    maxExpiryHours: int('REQUEST_MAX_EXPIRY_HOURS', 24 * 14),
    maxUnits: int('REQUEST_MAX_UNITS', 20),
  },

  /// Turning a typed address into coordinates. "none" means the client must supply
  /// lat/lng; a donor without either is still matched by state/district/city.
  geocoder: {
    provider: process.env.GEOCODER_PROVIDER ?? 'none',
    apiKey: process.env.GEOCODER_API_KEY ?? '',
    timeoutMs: int('GEOCODER_TIMEOUT_MS', 5000),
    /// Nominatim's usage policy requires an identifying User-Agent.
    userAgent: process.env.GEOCODER_USER_AGENT ?? 'RedExpress/0.1 (blood donation platform)',
    defaultCountry: process.env.GEOCODER_DEFAULT_COUNTRY ?? 'India',
  },

  /// Expo push. "console" prints instead of sending, which is the only way to exercise
  /// the notification path without a physical device — Expo Go cannot receive pushes, so
  /// real delivery needs a dev build (see docs/notifications.md).
  push: {
    provider: oneOf('PUSH_PROVIDER', ['expo', 'console'], 'console'),
    expo: {
      /// Only required when the Expo project has push security enabled.
      accessToken: process.env.EXPO_ACCESS_TOKEN ?? '',
      chunkSize: int('EXPO_PUSH_CHUNK_SIZE', 100),
    },
    /// The Android channel the app registers at startup. Its importance — not anything
    /// the server sends — is what decides whether the phone makes a sound.
    androidChannelId: process.env.PUSH_ANDROID_CHANNEL_ID ?? 'blood-requests',
    /// Expo drops an undelivered message after this long. A blood request that surfaces
    /// six hours late is worse than one that never arrives.
    ttlSeconds: int('PUSH_TTL_SECONDS', 60 * 60),
    /// Second-stage delivery check. Expo asks that receipts not be polled immediately.
    checkReceipts: bool('PUSH_CHECK_RECEIPTS', true),
    receiptDelayMs: int('PUSH_RECEIPT_DELAY_MS', 15 * 60 * 1000),
  },

  sms: {
    provider: smsProvider,
    msg91: {
      authKey: process.env.MSG91_AUTH_KEY ?? '',
      senderId: process.env.MSG91_SENDER_ID ?? '',
      templateId: process.env.MSG91_TEMPLATE_ID ?? '',
      route: process.env.MSG91_ROUTE ?? '4',
    },
  },
};

/**
 * With SMS_PROVIDER=console nobody actually receives a text, so the code is echoed in
 * the /auth/otp/request response to keep local development workable. Guarded twice —
 * production never returns it even if the provider is misconfigured.
 */
export const exposeOtpInResponse = env.sms.provider === 'console' && !env.isProduction;
