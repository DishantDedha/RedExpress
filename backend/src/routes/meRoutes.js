import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { meHandler } from '../controllers/profileController.js';

export const meRouter = Router();

/**
 * One call that answers "who is signed in and what can they do", for every role.
 * The app calls it on launch to decide between the home screen and the registration form.
 */
meRouter.get('/', requireAuth, meHandler);
