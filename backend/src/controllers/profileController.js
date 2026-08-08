import { asyncHandler } from '../utils/errors.js';
import {
  getDonorProfile,
  getMe,
  registerDonor,
  registerReceiver,
  setDonorAvailability,
  setLastDonationDate,
  updateDonorProfile,
} from '../services/profileService.js';

/**
 * Thin HTTP layer: the rules live in profileService. `req.file` is populated by the
 * optionalUpload middleware and is undefined when the client posted JSON.
 */

export const registerDonorHandler = asyncHandler(async (req, res) => {
  const result = await registerDonor(req.user, req.body, req.file);
  res.status(201).json({ ...result, message: 'Your donor account is ready.' });
});

export const getDonorMeHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await getDonorProfile(req.user));
});

export const updateDonorMeHandler = asyncHandler(async (req, res) => {
  const result = await updateDonorProfile(req.user, req.body, req.file);
  res.status(200).json({ ...result, message: 'Your profile has been updated.' });
});

export const updateAvailabilityHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await setDonorAvailability(req.user, req.body.isAvailable));
});

export const updateLastDonationHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await setLastDonationDate(req.user, req.body.date));
});

export const registerReceiverHandler = asyncHandler(async (req, res) => {
  const result = await registerReceiver(req.user, req.body);
  res.status(201).json({ ...result, message: 'You can now request blood.' });
});

export const meHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await getMe(req.user));
});
