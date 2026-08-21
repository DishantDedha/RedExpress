import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router/js-tabs';
import { Icon } from '../../../components';
import { colors, spacing, typography, a11y } from '../../../theme';

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
 * ## This is an accessibility improvement, not a trade against one
 *
 * A tab bar is often where mobile accessibility goes wrong — unlabelled icons, targets under
 * 48dp, selection signalled by a tint alone. None of that applies here:
 *
 *   labels     Always visible, never icon-only. The label is the control's accessible name,
 *              so the icon carries nothing of its own (see `Icon`, where every glyph is
 *              hidden from the accessibility tree outright).
 *   selection  React Navigation reports the focused tab through `accessibilityState.selected`,
 *              so a reader says "selected" rather than the user having to perceive a colour.
 *              The active tint is the redundant, visual half of that signal.
 *   targets    `minHeight` on the item, not a fixed height — the bar grows with the OS text
 *              setting instead of clipping the labels.
 *   contrast   Active is `primary` at 7.33:1 on white and inactive is `textMuted` at 6.58:1.
 *              Both are AA as *text*, which is the bar an always-visible label has to clear —
 *              a 3:1 "inactive" grey would have been legal for an icon and unreadable as a
 *              word.
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
  return (
    <Tabs
      screenOptions={{
        // Each screen draws its own hero band and heading; a navigator header as well would
        // mean the screen's name is announced twice on arrival.
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.bar,
        tabBarItemStyle: styles.item,
        tabBarLabelStyle: styles.label,
        // Otherwise the bar floats above the keyboard on the search and request forms,
        // covering the field being typed into.
        tabBarHideOnKeyboard: true,
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Icon name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="find-donors"
        options={{
          title: 'Find',
          // "Find" is what fits under an icon; it is not what should be spoken, because on
          // its own it does not say find *what*.
          tabBarAccessibilityLabel: 'Find blood donors',
          tabBarIcon: ({ color, size }) => <Icon name="search" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: 'Alerts',
          tabBarAccessibilityLabel: 'Your alerts',
          tabBarIcon: ({ color, size }) => <Icon name="bell" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Your profile and settings',
          tabBarIcon: ({ color, size }) => <Icon name="user" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    backgroundColor: colors.card,
    // A real line, not a shadow. Shadows are absent under Android's "remove animations"
    // setting, and the bar needs a visible boundary against a white sheet above it.
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
    paddingTop: spacing.xs,
  },
  item: {
    // A minimum, so the bar grows with the OS text size rather than clipping the labels.
    minHeight: a11y.minTouchTarget,
    paddingVertical: spacing.xs,
  },
  label: {
    fontSize: typography.caption.fontSize,
    fontWeight: '600',
  },
});
