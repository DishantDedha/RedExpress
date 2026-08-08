import { z } from 'zod';

/**
 * Device registration input.
 *
 * The token's *shape* is checked in deviceTokenService via the active push provider —
 * Expo owns that format and the console driver deliberately accepts anything — so this
 * schema only guards length and presence.
 */

export const expoPushToken = z
  .string({ required_error: 'A push token is required.' })
  .trim()
  .min(1, 'A push token is required.')
  .max(255, 'That push token is too long.');

export const registerDeviceSchema = z.object({
  expoPushToken,
  /// Sent by the app from expo Platform.OS. "web" is accepted because Expo Router builds
  /// a web target by default, even though pushes there are a later concern.
  platform: z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toLowerCase() : value),
    z.enum(['ios', 'android', 'web'], { errorMap: () => ({ message: 'Platform must be ios, android or web.' }) }),
  ),
});
