import { z } from 'zod';
import { boolish } from './common.js';
import { pagination } from './searchSchemas.js';

/** GET /notifications */
export const listNotificationsQuerySchema = z.object({
  /// The inbox's "Unread" filter. Defaults to false: the full history is the useful view,
  /// and the unread count comes back on every response either way.
  unreadOnly: boolish().optional().default(false),
  ...pagination,
});
