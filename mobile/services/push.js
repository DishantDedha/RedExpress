import { Platform } from 'react-native';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Device from 'expo-device';
import { api } from './apiClient';
import { config } from './config';
import { logger } from './logger';
import { getPushToken, savePushToken } from './tokenStorage';

/**
 * Push notifications on the device side.
 *
 * The backend already knows how to send them (Phase 5). This module does the three things
 * the phone is responsible for: ask permission properly, hand the resulting Expo token to
 * `POST /devices/register`, and give it back on sign-out.
 *
 * ## Permission is asked once, so it is asked well
 *
 * `requestPermissionsAsync` shows the OS dialog exactly once per install. Once someone
 * denies it, neither platform will ask again — the only route back is the Settings app,
 * which most people never find. So nothing here prompts on its own: the UI explains what
 * the alerts are for and the user presses a button that says what will happen
 * (`components/PushConsent.js`), and only then is `registerForPush({ prompt: true })`
 * called. Same pre-permission priming as the location capture in Phase 9.
 *
 * ## Every outcome is a value, not an exception
 *
 * Denied, blocked, no hardware, running in Expo Go, offline — all ordinary, and the caller
 * has something to say about each. Each result carries a `message` written to be read
 * aloud, because a blind donor pressing "Turn on alerts" gets no visual feedback from the
 * OS dialog at all, and silence is indistinguishable from a broken button.
 *
 * ## Testing
 *
 * Real delivery needs a physical device and an EAS dev build. Expo Go dropped remote push
 * support in SDK 53, and a simulator has no push service to mint a token against — both
 * come back as `status: 'unsupported'` with an explanation rather than a stack trace. See
 * `backend/docs/notifications.md`.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Must match `PUSH_ANDROID_CHANNEL_ID` on the backend — every message it sends names this
 * channel. On Android it is the *channel's* importance, not anything in the payload, that
 * decides whether the phone makes a sound and shows a heads-up banner, and a channel's
 * settings are fixed at creation: changing them later requires a new channel id.
 */
const ANDROID_CHANNEL_ID = 'blood-requests';

/**
 * True in Expo Go, false in a dev/production build.
 *
 * Expo Go dropped remote push in SDK 53, and on Android it does not merely fail at
 * `getExpoPushTokenAsync` — *importing* `expo-notifications` throws outright. A top-level
 * import here therefore took down every module that transitively pulls in this file, which
 * includes the signed-in layout: the visible symptom was expo-router failing with
 * "Cannot read property 'ErrorBoundary' of undefined", several frames away from the cause.
 *
 * So the native module is required lazily, only when it is safe to load, and every entry
 * point below returns `status: 'unsupported'` in Expo Go instead. That status was already
 * the contract with the UI (`components/PushConsent.js`, `app/(app)/privacy.js`) — it just
 * could never be reached, because the import crashed first.
 */
export const pushSupported = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let notificationsModule = null;

/**
 * The `expo-notifications` module, or null when it cannot be loaded.
 *
 * `require` rather than `import` is deliberate and is the whole point: Metro evaluates a
 * module the first time it is required, so this defers the crash-prone load until after the
 * guard has decided it is safe.
 *
 * @returns {typeof import('expo-notifications') | null}
 */
export function loadNotifications() {
  if (!pushSupported) return null;
  if (!notificationsModule) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    notificationsModule = require('expo-notifications');
  }
  return notificationsModule;
}

/** The sentence every unsupported path says. One wording, so the app never contradicts itself. */
const UNSUPPORTED_MESSAGE =
  'Alerts need a development build of the app; they do not work in Expo Go. You will still see requests in the app.';

let configured = false;

/**
 * Sets the foreground presentation policy and creates the Android channel.
 *
 * Foreground notifications are shown rather than swallowed, which is not the library
 * default. A donor with the app open in a hospital corridor is exactly the person who
 * should hear that someone two kilometres away needs their blood group; hiding it because
 * the app happens to be in the foreground would be perverse.
 *
 * Safe to call repeatedly — the app layout calls it on every mount.
 */
export async function configureNotifications() {
  if (configured) return;

  const Notifications = loadNotifications();
  // Not marked configured: nothing was configured, and a later dev build should retry.
  if (!Notifications) return;

  configured = true;

  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      // The badge is not maintained anywhere else, and a count that only ever grows is
      // worse than no count. The inbox screen owns the unread number.
      shouldSetBadge: false,
    }),
  });

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Blood requests',
      description: 'Alerts when a patient near you needs your blood group.',
      importance: Notifications.AndroidImportance.MAX,
      // A distinct pattern is a non-visual signal in its own right: a donor can tell this
      // apart from an ordinary notification without looking at the phone.
      vibrationPattern: [0, 250, 250, 250],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
    });
  }
}

// ---------------------------------------------------------------------------
// Permission and registration
// ---------------------------------------------------------------------------

/** @returns {'granted'|'denied'|'blocked'|'undetermined'|'unsupported'} */
export async function getPushPermissionStatus() {
  if (!Device.isDevice) return 'unsupported';

  const Notifications = loadNotifications();
  if (!Notifications) return 'unsupported';

  const { status, canAskAgain } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return 'granted';
  // `canAskAgain: false` means the OS will never show the dialog again. Telling these two
  // apart is what lets the UI say "open Settings" instead of offering a button that would
  // do nothing.
  if (status === 'denied' && !canAskAgain) return 'blocked';
  if (status === 'denied') return 'denied';
  return 'undetermined';
}

function projectId() {
  return (
    config.projectId ??
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    null
  );
}

/**
 * Gets this installation's Expo push token and registers it against the signed-in account.
 *
 * @param {boolean} [options.prompt] show the OS permission dialog if it has not been shown
 *        yet. False means "register if we already have permission, otherwise do nothing" —
 *        which is what the app does silently on every launch.
 *
 * @returns {Promise<{ status, message, token?, created?, reassigned? }>}
 */
export async function registerForPush({ prompt = false } = {}) {
  await configureNotifications();

  const Notifications = loadNotifications();
  if (!Notifications) {
    return { status: 'unsupported', message: UNSUPPORTED_MESSAGE };
  }

  if (!Device.isDevice) {
    return {
      status: 'unsupported',
      message:
        'Alerts only work on a real phone, not on a simulator. Everything else in the app works here.',
    };
  }

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.status === 'granted';

  if (!granted) {
    if (!prompt) return { status: existing.canAskAgain ? 'undetermined' : 'blocked', message: null };

    if (!existing.canAskAgain) {
      return {
        status: 'blocked',
        message:
          'Notifications are turned off for Red Express. You can turn them on in your phone settings. You will still see requests in the app.',
      };
    }

    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.status === 'granted';

    if (!granted) {
      return {
        status: 'denied',
        message:
          'Alerts are off. You will not be told when someone nearby needs blood, but you can still open the app and check.',
      };
    }
  }

  const id = projectId();
  if (!id) {
    // A dev build with no EAS project cannot mint a token. Said plainly, because the fix is
    // a config change and not something the user did.
    return {
      status: 'unsupported',
      message:
        'This build is not set up for alerts yet. Set EXPO_PUBLIC_PROJECT_ID and rebuild. You will still see requests in the app.',
    };
  }

  let token;
  try {
    const result = await Notifications.getExpoPushTokenAsync({ projectId: id });
    token = result.data;
  } catch (error) {
    // Anything the push service refuses — a dev build with no credentials, no network at
    // the moment the token is minted, a revoked EAS project.
    logger.warn('[push] could not get an Expo push token', error);
    return { status: 'unsupported', message: UNSUPPORTED_MESSAGE };
  }

  try {
    const result = await api.post('/devices/register', { expoPushToken: token, platform: Platform.OS });
    await savePushToken(token);

    return {
      status: 'granted',
      token,
      created: result.created,
      reassigned: result.reassigned,
      // The server's own sentence: "This device will receive blood request alerts."
      message: result.message,
    };
  } catch (error) {
    // A failed registration is not a failed sign-in. The user keeps their session and the
    // app works; they just will not be alerted until the next launch retries.
    logger.warn('[push] registering the device failed', error);
    return {
      status: 'error',
      message: `Alerts could not be switched on. ${error.message}`,
    };
  }
}

/**
 * Hands the token back on sign-out.
 *
 * This is what stops the next "someone nearby needs blood" from reaching a phone whose
 * owner has left — on a shared device that notification would leak a stranger's emergency,
 * which is the sharper version of the same problem.
 *
 * Never throws. A sign-out that fails because the network was down would leave the user
 * signed in on a screen that says they are not.
 */
export async function unregisterPush() {
  const token = await getPushToken();
  if (!token) return { removed: false };

  try {
    // The token contains brackets — `ExponentPushToken[xxxx]` — so it must be encoded.
    await api.del(`/devices/${encodeURIComponent(token)}`);
    return { removed: true };
  } catch (error) {
    logger.warn('[push] unregistering the device failed', error);
    return { removed: false };
  } finally {
    // Dropped locally either way: this installation is no longer that user's, so keeping a
    // token registered to them is worse than losing the ability to retry the delete.
    await savePushToken(null);
  }
}

// ---------------------------------------------------------------------------
// Deep links
// ---------------------------------------------------------------------------

/**
 * Where a tapped notification should take the user.
 *
 * The route comes from the payload's `screen` field rather than being reconstructed from
 * the type here, so a deep link can be fixed server-side without shipping an app update
 * (`backend/src/services/pushMessages.js`). This function is the one place that maps it,
 * and it returns null for anything unrecognised — an old build receiving a payload from a
 * newer backend opens the inbox instead of crashing on a route that does not exist.
 */
export function routeForNotification(data) {
  if (!data) return null;

  if (data.screen === 'request-detail' && data.requestId) {
    return {
      pathname: '/requests/[id]',
      params: {
        id: String(data.requestId),
        // Carried through so the destination can mark the inbox row read without first
        // having to search the inbox for the notification that opened it.
        ...(data.notificationId ? { notificationId: String(data.notificationId) } : {}),
      },
    };
  }

  return null;
}
