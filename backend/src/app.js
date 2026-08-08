import { randomUUID } from 'node:crypto';
import express from 'express';
import { ZodError } from 'zod';
import { env } from './config/env.js';
import { ApiError } from './utils/errors.js';
import { fieldsFromZod } from './middleware/validate.js';
import { authRouter } from './routes/authRoutes.js';
import { donorRouter } from './routes/donorRoutes.js';
import { receiverRouter } from './routes/receiverRoutes.js';
import { meRouter } from './routes/meRoutes.js';
import { requestRouter } from './routes/requestRoutes.js';
import { deviceRouter } from './routes/deviceRoutes.js';
import { notificationRouter } from './routes/notificationRoutes.js';
import { crmRouter } from './routes/crmRoutes.js';
import { healthRouter } from './routes/healthRoutes.js';
import { corsPolicy, securityHeaders } from './middleware/security.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { storage } from './services/storage/index.js';

/**
 * Builds the Express app. Kept separate from server.js so tests can import the
 * app without binding a port.
 *
 * Routers are mounted here as later phases add them:
 *   /auth      (Phase 2)   /donors /receivers /me   (Phase 3)
 *   /requests  (Phase 4)   /devices /notifications  (Phase 5)
 *   /crm       (Phase 6)
 */
export function createApp() {
  const app = express();

  // Rate limiting keys on req.ip, which is the proxy's address unless Express is told how
  // many hops to look past. Set deliberately from TRUST_PROXY — see config/env.js for why
  // neither `true` nor `false` is a safe default.
  app.set('trust proxy', env.trustProxy);

  // Nothing about this API's responses should be sniffed, framed, or cached by a browser.
  app.use(securityHeaders());
  app.use(corsPolicy());

  // Health checks are mounted ahead of the rate limiter on purpose. A platform's probe polls
  // from a fixed address at a fixed interval; counting it against a limit meant for callers
  // is how a service gets marked unhealthy for being healthy.
  app.use('/health', healthRouter);

  // The crude flood guard. The endpoint-specific limits that actually matter — OTP, sign-in,
  // search — are attached inside their own routers.
  app.use(globalLimiter);

  // Bodies are small by design; the ceiling stops a large one being parsed before any
  // validation sees it. Multipart uploads bypass this and are capped by multer instead.
  app.use(express.json({ limit: env.bodyLimit }));
  // Some SMS and payment webhooks post form-encoded bodies; accepting the shape here costs
  // nothing and avoids a confusing empty req.body if one is ever wired up.
  app.use(express.urlencoded({ extended: false, limit: env.bodyLimit }));

  // Uploaded profile photos. Only the local driver needs this — with STORAGE_DRIVER=s3 the
  // bucket (or its CDN) serves the files and the API never touches them again.
  if (storage.name === 'local') {
    app.use(
      storage.publicPath,
      express.static(storage.root, {
        index: false,
        dotfiles: 'deny',
        // Keys are random and never reused, so a stored file can be cached indefinitely.
        maxAge: '1y',
        immutable: true,
      }),
    );
  }

  app.use('/auth', authRouter);
  app.use('/donors', donorRouter);
  app.use('/receivers', receiverRouter);
  app.use('/me', meRouter);
  app.use('/requests', requestRouter);
  app.use('/devices', deviceRouter);
  app.use('/notifications', notificationRouter);
  app.use('/crm', crmRouter);

  // Every endpoint answers with the same error envelope:
  // { error: { code, message, fields? } }
  app.use((req, res) => {
    res.status(404).json({
      error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` },
    });
  });

  // eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
  app.use((err, req, res, next) => {
    if (err instanceof ApiError) {
      res.status(err.status).json({
        error: { code: err.code, message: err.message, ...(err.fields ? { fields: err.fields } : {}) },
      });
      return;
    }

    // A zod schema parsed outside validate() — e.g. inside a service.
    if (err instanceof ZodError) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Please check the highlighted fields.',
          fields: fieldsFromZod(err),
        },
      });
      return;
    }

    // Malformed JSON body — thrown by express.json().
    if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Request body is not valid JSON.' } });
      return;
    }

    // Over env.bodyLimit — thrown by express.json() before it parses anything.
    if (err.type === 'entity.too.large') {
      res.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'That request is too large.' },
      });
      return;
    }

    // Anything past this point is unexpected. Log it in full — with a correlation id the
    // caller also receives, so a user's "it said something went wrong at 14:32" can be
    // matched to a stack trace without asking them for anything they cannot see.
    const errorId = randomUUID();
    console.error(`[error] ${errorId} ${req.method} ${req.path}`, err);

    res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Something went wrong.',
        errorId,
        // Stack traces never cross the wire. In production not even the message does: a
        // Prisma or pg error carries table names, column names, and sometimes the
        // connection string. Outside production the message alone saves a log dive.
        ...(env.isProduction ? {} : { detail: err.message }),
      },
    });
  });

  return app;
}
