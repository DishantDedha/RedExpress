import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  callLogQuerySchema,
  createCallLogSchema,
  markDeadSchema,
  nearbyDonorsQuerySchema,
  reactivateSchema,
  userSearchQuerySchema,
} from '../validation/crmSchemas.js';
import {
  createCallLogHandler,
  getUserDetailHandler,
  listCallLogsHandler,
  markDeadHandler,
  nearbyDonorsHandler,
  reactivateHandler,
  searchUsersHandler,
  statsHandler,
} from '../controllers/crmController.js';

export const crmRouter = Router();

/**
 * Everything under /crm is staff-only.
 *
 * The gate is on the router rather than per-route on purpose: these endpoints return
 * unredacted personal data — home addresses, coordinates, phone numbers, call history —
 * and a new route added below must not be able to forget the check.
 */
crmRouter.use(requireAuth, requireRole('STAFF', 'ADMIN'));

// --- read ------------------------------------------------------------------

crmRouter.get('/stats', statsHandler);

crmRouter.get('/users/search', validate(userSearchQuerySchema, 'query'), searchUsersHandler);
// Declared after /users/search so "search" is never matched as a user id.
crmRouter.get('/users/:userId', getUserDetailHandler);

crmRouter.get('/donors/nearby', validate(nearbyDonorsQuerySchema, 'query'), nearbyDonorsHandler);

crmRouter.get('/call-logs', validate(callLogQuerySchema, 'query'), listCallLogsHandler);

// --- write -----------------------------------------------------------------

crmRouter.post('/call-logs', validate(createCallLogSchema), createCallLogHandler);

/**
 * The lifecycle actions. STAFF may take a donor out of circulation because that is a
 * report from the phones; only an ADMIN may put them back, because that overrules one.
 * The donor's own route back is re-verifying by OTP — see docs/crm-lifecycle.md.
 */
crmRouter.post('/donors/:userId/mark-dead', validate(markDeadSchema), markDeadHandler);
crmRouter.post('/donors/:userId/reactivate', requireRole('ADMIN'), validate(reactivateSchema), reactivateHandler);
