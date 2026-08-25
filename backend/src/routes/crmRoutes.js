import { Router } from 'express';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  callLogQuerySchema,
  createCallLogSchema,
  deleteUserSchema,
  markDeadSchema,
  nearbyDonorsQuerySchema,
  reactivateSchema,
  setUserStatusSchema,
  updateUserSchema,
  userSearchQuerySchema,
} from '../validation/crmSchemas.js';
import {
  createCallLogHandler,
  deleteUserHandler,
  getUserDetailHandler,
  listCallLogsHandler,
  markDeadHandler,
  nearbyDonorsHandler,
  reactivateHandler,
  reportsHandler,
  searchUsersHandler,
  setUserStatusHandler,
  statsHandler,
  updateUserHandler,
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
crmRouter.get('/reports', reportsHandler);

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

/**
 * Record management. Edit and delete are ADMIN-only — a wrong edit or an accidental
 * delete on someone else's account is a different order of consequence to logging a call,
 * and the same reasoning that makes reactivate ADMIN-only applies here. Blocking follows
 * the mark-dead split instead: STAFF may block (a report that this account should not be
 * allowed to sign in), only ADMIN may unblock, because unblocking overrules that report.
 */
crmRouter.patch('/users/:userId', requireRole('ADMIN'), validate(updateUserSchema), updateUserHandler);
// Both directions share one endpoint; the admin-only rule for unblocking lives inside
// setUserStatus itself (see crmAdminService.js), since which way is admin-only depends on
// the body, not the route.
crmRouter.patch('/users/:userId/status', validate(setUserStatusSchema), setUserStatusHandler);
crmRouter.delete('/users/:userId', requireRole('ADMIN'), validate(deleteUserSchema), deleteUserHandler);
