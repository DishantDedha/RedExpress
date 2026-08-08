import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listNotificationsQuerySchema } from '../validation/notificationSchemas.js';
import {
  listNotificationsHandler,
  markNotificationReadHandler,
} from '../controllers/notificationController.js';

export const notificationRouter = Router();

// An inbox is per-person by definition; ownership is re-checked in the service.
notificationRouter.use(requireAuth);

notificationRouter.get('/', validate(listNotificationsQuerySchema, 'query'), listNotificationsHandler);
notificationRouter.patch('/:id/read', markNotificationReadHandler);
