import { asyncHandler } from '../utils/errors.js';
import { listNotifications, markNotificationRead } from '../services/notificationService.js';

/** Thin HTTP layer — the rules live in notificationService. */

export const listNotificationsHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await listNotifications(req.user, req.query));
});

export const markNotificationReadHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await markNotificationRead(req.user, req.params.id));
});
