import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { receiverRegisterSchema } from '../validation/profileSchemas.js';
import { registerReceiverHandler } from '../controllers/profileController.js';

export const receiverRouter = Router();

// No file upload on this form — the receiver flow is deliberately short, because it is
// filled in during an emergency.
receiverRouter.post('/register', requireAuth, validate(receiverRegisterSchema), registerReceiverHandler);
