import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { registerDeviceSchema } from '../validation/deviceSchemas.js';
import {
  listDevicesHandler,
  registerDeviceHandler,
  unregisterDeviceHandler,
} from '../controllers/deviceController.js';

export const deviceRouter = Router();

// A device token is bound to the account that registered it, so every route here needs
// to know who is asking.
deviceRouter.use(requireAuth);

deviceRouter.post('/register', validate(registerDeviceSchema), registerDeviceHandler);
deviceRouter.get('/', listDevicesHandler);

// The token sits in the path, per the phase brief. Expo tokens look like
// "ExponentPushToken[xxxxxxxx]" — the brackets are legal in a path segment, but the app
// should still encodeURIComponent it.
deviceRouter.delete('/:token', unregisterDeviceHandler);
