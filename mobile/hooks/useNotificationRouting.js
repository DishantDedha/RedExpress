import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import { announce } from '../components/LiveMessage';
import { configureNotifications, loadNotifications, routeForNotification } from '../services/push';

/**
 * Tapping "Urgent: O negative blood needed nearby" opens the request.
 *
 * Mounted once, inside the signed-in stack. It covers the two ways a notification can be
 * acted on, which are genuinely different code paths:
 *
 *   warm — the app is running (foreground or background). `addNotificationResponseReceivedListener`
 *          fires on the tap.
 *
 *   cold — the app was not running and the tap launched it. No listener exists yet when the
 *          response is delivered, so it has to be *pulled* with
 *          `getLastNotificationResponseAsync` on mount. Miss this and tapping a notification
 *          from a killed app dumps the donor on the home screen with no idea why their phone
 *          buzzed — the single most common bug in push deep-linking, and invisible in
 *          testing because the app is nearly always already running while you develop.
 *
 * The cold-start response is remembered by the OS and returned again on subsequent calls, so
 * `handled` guards against re-navigating on every remount — otherwise a donor who taps a
 * notification, reads the request, and goes home gets thrown back into it.
 *
 * ## Why it announces before navigating
 *
 * A screen change with no explanation is disorienting, and a screen-reader user gets no
 * visual cue that the tap did anything at all. The announcement lands immediately; the
 * destination screen then moves focus to its own heading and reads the request out
 * (`app/(app)/requests/[id].js`).
 */
export function useNotificationRouting() {
  const router = useRouter();
  const handled = useRef(new Set());

  useEffect(() => {
    // Null in Expo Go, where no notification can arrive to be routed anyway. Loaded through
    // services/push so the guard lives in exactly one place — see `pushSupported` there.
    const Notifications = loadNotifications();
    if (!Notifications) return undefined;

    let active = true;

    function open(response, { cold }) {
      const data = response?.notification?.request?.content?.data;
      const route = routeForNotification(data);
      if (!route) return;

      // Identify the response, not the request: the same request can legitimately produce a
      // second notification, and that one should still open.
      const key = response.notification.request.identifier;
      if (handled.current.has(key)) return;
      handled.current.add(key);

      announce(cold ? 'Opening the blood request from your notification.' : 'Opening the blood request.');
      router.push(route);
    }

    // Cold start. Awaited before the listener is attached so a tap that both launched the
    // app and arrives at the listener cannot navigate twice.
    (async () => {
      await configureNotifications();
      const last = await Notifications.getLastNotificationResponseAsync();
      if (active && last) open(last, { cold: true });
    })();

    const subscription = Notifications.addNotificationResponseReceivedListener((response) =>
      open(response, { cold: false }),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, [router]);
}

export default useNotificationRouting;
