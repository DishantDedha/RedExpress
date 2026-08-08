import { asyncHandler } from '../utils/errors.js';
import {
  createRequest,
  getRequest,
  listMatches,
  listRequests,
  respondToMatch,
  updateRequestStatus,
} from '../services/requestService.js';

/** Thin HTTP layer — the rules live in requestService and matchingEngine. */

export const createRequestHandler = asyncHandler(async (req, res) => {
  res.status(201).json(await createRequest(req.user, req.body));
});

export const listRequestsHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await listRequests(req.user, req.query));
});

export const getRequestHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await getRequest(req.user, req.params.id));
});

export const updateRequestStatusHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await updateRequestStatus(req.user, req.params.id, req.body.status, req.body.note));
});

export const listMatchesHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await listMatches(req.user, req.params.id, req.query));
});

export const respondToMatchHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await respondToMatch(req.user, req.params.id, req.params.donorId, req.body.response));
});
