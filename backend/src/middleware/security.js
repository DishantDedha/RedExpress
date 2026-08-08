import cors from 'cors';
import helmet from 'helmet';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';

/**
 * The HTTP-level defences: response headers and cross-origin policy.
 *
 * Everything here is about what a *browser* is allowed to do with this API. The mobile app
 * is unaffected — React Native's fetch is not a browser, sends no Origin, and honours none
 * of these headers — so the settings can be as strict as the CRM allows without costing the
 * app anything.
 */

// ---------------------------------------------------------------------------
// Helmet
// ---------------------------------------------------------------------------

/**
 * This service answers JSON, plus (in the local-storage configuration) uploaded profile
 * photos. It renders no HTML of its own, which makes most of helmet's defaults free.
 *
 * Two deliberate deviations:
 *
 *   contentSecurityPolicy — a CSP on a JSON response does nothing, but it is the last line
 *   of defence if a browser is ever tricked into rendering one, so it stays on with
 *   everything denied rather than helmet's default (which permits same-origin scripts).
 *
 *   crossOriginResourcePolicy — must be 'cross-origin', not the default 'same-origin'.
 *   Profile photos are served from this origin and displayed by the CRM on another one;
 *   'same-origin' would leave every donor's photo as a broken image in the dashboard.
 */
export function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'none'"],
        frameAncestors: ["'none'"],
        baseUri: ["'none'"],
        formAction: ["'none'"],
        // Uploaded photos are the one thing a browser legitimately renders from here.
        imgSrc: ["'self'"],
        sandbox: ['allow-downloads'],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    // The API is served under its own hostname; HSTS is the platform's or the reverse
    // proxy's call there, and asserting it from here on a plain-http staging box would
    // pin that hostname to https in every developer's browser for a year.
    strictTransportSecurity: env.isProduction,
    // Nothing here is worth a Referer header on an outbound link, and the API emits none.
    referrerPolicy: { policy: 'no-referrer' },
  });
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

/** Compares scheme + host + port, ignoring any path or trailing slash someone configured. */
function sameOrigin(a, b) {
  try {
    const left = new URL(a);
    const right = new URL(b);
    return left.protocol === right.protocol && left.host === right.host;
  } catch {
    return false;
  }
}

/**
 * An allow-list, never a reflector.
 *
 * `origin` is undefined for same-origin requests, curl, and the mobile app — those are not
 * cross-origin requests at all and CORS has no opinion about them, so they pass through
 * untouched. A browser presenting an origin that is not on the list gets no
 * Access-Control-Allow-Origin header back, which is what actually blocks it.
 *
 * A rejected origin fails as a 403 with the normal error envelope rather than the `cors`
 * package's bare "Not allowed by CORS" text, so a misconfigured deployment produces a
 * message that names the fix.
 */
export function corsPolicy() {
  const allowed = env.corsOrigins;

  return cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);

      if (allowed.some((candidate) => sameOrigin(candidate, origin))) {
        return callback(null, true);
      }

      callback(
        ApiError.forbidden(
          'CORS_ORIGIN_DENIED',
          `Origin ${origin} is not allowed to call this API. Add it to CORS_ORIGINS.`,
        ),
      );
    },
    // The CRM's browser calls carry an Authorization header, not a cookie — its session
    // cookie is for its own origin and is read server-side. Credentials stay off so a
    // stray cookie can never be replayed cross-site.
    credentials: false,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
    maxAge: 86_400,
  });
}
