import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createRequestSchema,
  listMatchesQuerySchema,
  listRequestsQuerySchema,
  respondToMatchSchema,
  updateRequestStatusSchema,
} from '../validation/requestSchemas.js';
import {
  createRequestHandler,
  getRequestHandler,
  listMatchesHandler,
  listRequestsHandler,
  respondToMatchHandler,
  updateRequestStatusHandler,
} from '../controllers/requestController.js';

export const requestRouter = Router();

// Blood requests carry a patient's hospital and a contact number. Nothing here is public.
requestRouter.use(requireAuth);

// Role is checked in the service rather than with requireRole, because who may post is a
// product rule with a documented exception (see REQUEST_CREATOR_ROLES) rather than a
// plain role gate.
requestRouter.post('/', validate(createRequestSchema), createRequestHandler);

requestRouter.get('/', validate(listRequestsQuerySchema, 'query'), listRequestsHandler);
requestRouter.get('/:id', getRequestHandler);
requestRouter.patch('/:id/status', validate(updateRequestStatusSchema), updateRequestStatusHandler);

// The CRM's call worklist (Phase 6) and the requester's own "who was notified" view.
requestRouter.get('/:id/matches', validate(listMatchesQuerySchema, 'query'), listMatchesHandler);

// A donor answering a push notification. Only the donor named in the URL may call it.
requestRouter.post('/:id/matches/:donorId/respond', validate(respondToMatchSchema), respondToMatchHandler);
