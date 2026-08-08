import { asyncHandler } from '../utils/errors.js';
import { listDevices, registerDevice, unregisterDevice } from '../services/deviceTokenService.js';

/** Thin HTTP layer — the rules live in deviceTokenService. */

export const registerDeviceHandler = asyncHandler(async (req, res) => {
  const result = await registerDevice(req.user, req.body);
  res.status(result.created ? 201 : 200).json({
    ...result,
    message: 'This device will receive blood request alerts.',
  });
});

export const unregisterDeviceHandler = asyncHandler(async (req, res) => {
  const result = await unregisterDevice(req.user, req.params.token);
  res.status(200).json({
    ...result,
    message: 'This device will no longer receive blood request alerts.',
  });
});

export const listDevicesHandler = asyncHandler(async (req, res) => {
  res.status(200).json(await listDevices(req.user));
});
