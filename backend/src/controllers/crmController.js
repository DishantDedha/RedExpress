import { asyncHandler } from '../utils/errors.js';
import { crmStats, getUserDetail, nearbyDonorsForRequest, searchUsers } from '../services/crmService.js';
import { listCalls, recordCall } from '../services/callLogService.js';
import { markUserDead, reactivateUser } from '../services/donorLifecycleService.js';

/** Thin HTTP layer — the rules live in crmService, callLogService and donorLifecycleService. */

export const searchUsersHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await searchUsers(req.query));
});

export const getUserDetailHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await getUserDetail(req.params.userId));
});

export const nearbyDonorsHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await nearbyDonorsForRequest(req.query.requestId));
});

export const createCallLogHandler = asyncHandler(async (req, res) => {
  res.status(201).json(await recordCall(req.user, req.body));
});

export const listCallLogsHandler = asyncHandler(async (req, res) => {
  res.status(200).json({ calls: await listCalls(req.query) });
});

export const markDeadHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await markUserDead(req.user, req.params.userId, req.body));
});

export const reactivateHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await reactivateUser(req.user, req.params.userId, req.body));
});

export const statsHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await crmStats());
});
