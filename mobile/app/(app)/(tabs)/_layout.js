import { Tabs } from 'expo-router/js-tabs';
import { BottomTabBar, useTabBarHeight } from '../../../components';

/**
 * The tabs, in bar order.
 *
 * A plain table rather than something read off the navigator, because the navigator also
 * holds the routes that are deliberately *off* the bar — `find-donors` is reachable from Home
 * and has no slot here.
 */
const TABS = [
  { name: 'home', label: 'Home', icon: 'home' },
  {
    name: 'donate',
    label: 'Donate',
    icon: 'heart',
    accessibilityLabel: 'Donate to Red Express',
  },
  {
    name: 'notifications',
    label: 'Alerts',
    icon: 'bell',
    accessibilityLabel: 'Your alerts',
  },
  {
    name: 'profile',
    label: 'Profile',
    icon: 'user',
    accessibilityLabel: 'Your profile and settings',
  },
];

/**
 * The four places a signed-in user actually goes.
 *
 * ## What this replaced, and why
 *
 * Home used to be a single column of eight identical full-width buttons: find donors,
 * request blood, alerts, profile, accessibility settings, privacy, the component kit, sign
 * out. Every one of them was drawn at the same weight, so the screen said nothing about
 * which of them was the product and which was housekeeping — and reaching the profile meant
 * going home first and reading down a list.
 *
 * Four destinations are now permanent and one tap away, and the housekeeping moved onto the
 * profile tab where it belongs.
 *
 * ## Back out of a tab reached from Home
 *
 * `find-donors` and `notifications` are tabs, but Home links into both — and `router.push` to a
 * tab switches tabs rather than stacking a screen, so there is no history for a back button to
 * pop. Each of those screens draws its own `ScreenHeader layout="bar" back="/home"`, which goes
 * to Home explicitly.
 *
 * That replaced a transparent native header with a hand-drawn chevron floating over the band. It
 * had to float, because a solid native header above a red band is a second bar; floating, it sat
 * exactly where the title wanted to be, which is why the band carried 56px of top padding. The
 * bar draws the chevron inside itself and the padding went away with it.
 *
 * ## The bar draws itself
 *
 * `BottomTabBar` is the red slab from the GMP app, gradient and all, so the navigator is told
 * only two things about it: do not draw a background of your own (anything it painted would
 * show through the bar's rounded top corners), and this is how tall the bar is.
 *
 * That height has to be the true one, inset and all. A custom `tabBar` is laid out in flow and
 * sizes itself, but this number is what the navigator reports as the tab bar's height to
 * anything that asks — and it is computed from the current text size, because the bar carries
 * labels and a fixed height clips them at 200%. See `useTabBarHeight`.
 *
 * ## Why a group rather than moving the stack
 *
 * `(tabs)` adds no URL segment, so these screens are still `/home`, `/find-donors`,
 * `/notifications` and `/profile`. Every deep link in the push notifications, every
 * `router.push` elsewhere in the app, and the notification routing in the parent layout all
 * keep working untouched. The tabs sit *inside* the signed-in stack, so `/post-request` and
 * `/requests/[id]` still push over the top of them with a real back button, which is what a
 * notification tapped from the lock screen needs.
 */
export default function TabsLayout() {
  const barHeight = useTabBarHeight();

  return (
    <Tabs
      screenOptions={{
        // Each screen draws its own hero band and heading; a navigator header as well would
        // mean the screen's name is announced twice on arrival.
        headerShown: false,
        tabBarStyle: { height: barHeight, borderTopWidth: 0, backgroundColor: 'transparent' },
        // Otherwise the bar floats above the keyboard on the search and request forms,
        // covering the field being typed into.
        tabBarHideOnKeyboard: true,
      }}
      tabBar={(props) => <BottomTabBar {...props} tabs={TABS} />}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="donate" options={{ title: 'Donate' }} />
      {/* Off the bar, not gone — the file-based navigator auto-lists every screen in this
          directory, so dropping the Tabs.Screen for a removed tab does not remove the route,
          it just shows up with default options. `href: null` is the documented way to keep
          `/find-donors` reachable (Home still links to it) without a slot in the bar. */}
      <Tabs.Screen name="find-donors" options={{ href: null }} />
      <Tabs.Screen name="notifications" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
