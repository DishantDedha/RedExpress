import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { optionalUpload } from '../middleware/upload.js';
import { searchLimiter } from '../middleware/rateLimit.js';
import {
  availabilitySchema,
  donorRegisterSchema,
  donorUpdateSchema,
  lastDonationSchema,
} from '../validation/profileSchemas.js';
import { donorSearchQuerySchema } from '../validation/searchSchemas.js';
import { searchDonorsHandler } from '../controllers/searchController.js';
import {
  getDonorMeHandler,
  registerDonorHandler,
  updateAvailabilityHandler,
  updateDonorMeHandler,
  updateLastDonationHandler,
} from '../controllers/profileController.js';

export const donorRouter = Router();

// Everything here is the caller acting on their own profile, so requireAuth is enough —
// the phone-verified check lives in the service alongside the other registration rules.
donorRouter.use(requireAuth);

// optionalUpload runs before validate so multer can populate req.body from the multipart
// fields; a JSON body passes through it untouched.
donorRouter.post('/register', optionalUpload('profilePhoto'), validate(donorRegisterSchema), registerDonorHandler);

// Donor records are personal data, so search is for signed-in users only — but any role
// may run it: a receiver looking for blood is the whole point, and staff use the same
// query behind the CRM.
//
// searchLimiter is the anti-scraping ceiling. Being signed in is not much of a barrier when
// signing in only costs one SMS, so a valid session must not be a licence to page through
// every donor in the state.
donorRouter.get('/search', searchLimiter, validate(donorSearchQuerySchema, 'query'), searchDonorsHandler);

donorRouter.get('/me', getDonorMeHandler);
donorRouter.patch('/me', optionalUpload('profilePhoto'), validate(donorUpdateSchema), updateDonorMeHandler);

donorRouter.patch('/me/availability', validate(availabilitySchema), updateAvailabilityHandler);
donorRouter.patch('/me/last-donation', validate(lastDonationSchema), updateLastDonationHandler);
