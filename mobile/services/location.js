import * as Location from 'expo-location';

/**
 * Getting the donor's coordinates.
 *
 * Coordinates are what make the whole product work: Phase 4 matches donors to a request by
 * Haversine distance, so a donor with no position is only reachable by a district-wide
 * fallback. It is still optional, and deliberately so — see below.
 *
 * ## Nothing here prompts without warning
 *
 * The OS permission dialog is a one-shot resource: once someone denies it, iOS will not ask
 * again, and the only route back is the Settings app. So the UI explains why the location is
 * wanted *before* calling any of this ("pre-permission priming"), and this module is only
 * reached once the user has pressed a button that says what it will do.
 *
 * ## Denial is not a dead end
 *
 * If permission is refused, registration continues. The typed address is geocoded
 * server-side instead (`backend/src/services/locationService.js`), and a record with no
 * coordinates still matches on state and district. A blind user in particular may have good
 * reason to decline, and losing the ability to register over it would be indefensible.
 *
 * Every result is a plain object rather than an exception, because every outcome here is
 * ordinary and the caller has something to say about each one.
 */

/**
 * Reads the current location permission WITHOUT ever prompting.
 *
 * The distinction matters: `captureCurrentPosition` below may show the OS dialog, and the OS
 * only shows it once. The privacy screen needs to *report* what the user has already decided,
 * and a screen that silently triggered the one permission prompt a donor gets — just for
 * being opened — would spend it on a page that was only meant to explain things.
 *
 * @returns {Promise<'granted'|'denied'|'blocked'|'disabled'|'error'>}
 */
export async function getLocationPermissionStatus() {
  try {
    if (!(await Location.hasServicesEnabledAsync())) return 'disabled';

    const permission = await Location.getForegroundPermissionsAsync();
    if (permission.granted) return 'granted';
    // The OS will not show the dialog again; only Settings can change this.
    return permission.canAskAgain ? 'denied' : 'blocked';
  } catch {
    return 'error';
  }
}

/** @returns {{ status: 'granted'|'denied'|'blocked'|'disabled'|'error', message: string, coords?: {latitude, longitude, accuracy} }} */
export async function captureCurrentPosition() {
  try {
    const enabled = await Location.hasServicesEnabledAsync();
    if (!enabled) {
      return {
        status: 'disabled',
        message:
          'Location services are switched off on this phone. Turn them on, or continue and we will use your typed address.',
      };
    }

    const existing = await Location.getForegroundPermissionsAsync();

    // `canAskAgain: false` means the OS will no longer show the dialog — asking again does
    // nothing and would look like the button is broken. The message points at Settings.
    if (!existing.granted && !existing.canAskAgain) {
      return {
        status: 'blocked',
        message:
          'Location permission is turned off for Red Express. You can turn it on in your phone settings, or continue and we will use your typed address.',
      };
    }

    const permission = existing.granted ? existing : await Location.requestForegroundPermissionsAsync();

    if (!permission.granted) {
      return {
        status: 'denied',
        message:
          'Location permission was not granted. We will use your typed address instead, which works but is less precise.',
      };
    }

    const position = await Location.getCurrentPositionAsync({
      // Balanced is roughly city-block accuracy and returns in a couple of seconds. High
      // accuracy would take far longer for a precision that a donor-matching radius
      // measured in kilometres cannot use.
      accuracy: Location.Accuracy.Balanced,
    });

    return {
      status: 'granted',
      message: 'Using your current location.',
      coords: {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null,
      },
    };
  } catch {
    return {
      status: 'error',
      message:
        'We could not get your location just now. Continue and we will use your typed address instead.',
    };
  }
}
