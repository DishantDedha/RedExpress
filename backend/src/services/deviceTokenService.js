import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/errors.js';
import { isValidPushToken } from './pushService.js';

/**
 * Device tokens: which phones belong to which user.
 *
 * The interesting case is re-assignment. An Expo push token identifies an installation,
 * not a person, so a shared or resold phone can present the same token under a second
 * account. The unique constraint on expoPushToken means the row simply moves to whoever
 * registered last — anything else would push one person's blood requests to another
 * person's phone.
 */

/** Registers (or re-points) a device token for the signed-in user. */
export async function registerDevice(user, { expoPushToken, platform }) {
  if (!isValidPushToken(expoPushToken)) {
    throw ApiError.badRequest('INVALID_PUSH_TOKEN', 'That push token is not a valid Expo token.', {
      expoPushToken: 'This device could not be registered for notifications.',
    });
  }

  const existing = await prisma.deviceToken.findUnique({ where: { expoPushToken } });

  const device = await prisma.deviceToken.upsert({
    where: { expoPushToken },
    create: { userId: user.id, expoPushToken, platform },
    update: { userId: user.id, platform },
  });

  return {
    device: { id: device.id, platform: device.platform, createdAt: device.createdAt },
    // Tells the client whether this was a fresh registration, so the app can announce
    // "Notifications are on" only when something actually changed.
    created: !existing,
    reassigned: Boolean(existing) && existing.userId !== user.id,
  };
}

/**
 * Unregisters a token, normally on logout.
 *
 * Only the owner may remove it. Deleting on sign-out is what stops the next "someone
 * nearby needs blood" from reaching a phone whose user has left — especially on a shared
 * device, where the notification would otherwise leak a stranger's emergency.
 */
export async function unregisterDevice(user, expoPushToken) {
  const device = await prisma.deviceToken.findUnique({ where: { expoPushToken } });

  // Logging out twice, or from a device already dropped as unregistered, is not an error
  // worth failing a sign-out over.
  if (!device) return { removed: false };

  if (device.userId !== user.id) {
    throw ApiError.forbidden('FORBIDDEN', 'That device is registered to another account.');
  }

  await prisma.deviceToken.delete({ where: { id: device.id } });
  return { removed: true };
}

/** The signed-in user's registered devices, for a settings screen or support call. */
export async function listDevices(user) {
  const devices = await prisma.deviceToken.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    select: { id: true, platform: true, createdAt: true },
  });
  return { devices, total: devices.length };
}
