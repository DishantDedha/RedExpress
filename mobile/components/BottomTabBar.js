import { useEffect, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from './AppText';
import { Gradient } from './Gradient';
import { Icon } from './Icon';
import { usePreference } from '../hooks/usePreferences';
import { hapticTap } from '../services/feedback';
import { a11y, colors, radius, spacing, typography } from '../theme';

/**
 * The app's bottom bar: a near-black red slab with rounded top corners, and the selected tab
 * lifted out of it onto a pale disc.
 *
 * This is GMP's bar, and it is drawn rather than imported. GMP bakes the slab into a PNG
 * because that app has no gradient dependency; neither does this one, but it does have
 * `<Gradient/>`, which paints the same ramp from the two stops in `colors.gradientBar`. That
 * keeps the bar in the palette instead of in an image nobody re-exports when the red changes.
 *
 * ## What it replaced
 *
 * A white bar with a hairline on top, the selected tab marked by tinting its icon and label
 * red. It was legible and completely anonymous — the one piece of chrome visible on every
 * screen, saying nothing about whose app this is.
 *
 * ## The label stays, on the selected tab too
 *
 * GMP's selected tab is a disc with the icon alone in it: their labels are "Categories" and
 * "My Orders", which do not fit across 62px at a size worth reading. Red Express has four
 * tabs called Home, Donate, Alerts and Profile, all of which do fit, so the label is kept
 * under the disc rather than dropped.
 *
 * That is not a small detail. An icon-only selected tab means the one tab whose name a
 * sighted user most wants confirmed — the one they are on — is the only one not spelled out.
 * Here the bar looks like GMP's and still never asks anyone to recognise a glyph:
 *
 *   labels     Always visible, never icon-only. The label is also the control's accessible
 *              name, so the icon carries nothing of its own (see `Icon`, where every glyph is
 *              hidden from the accessibility tree outright).
 *   selection  Reported through `accessibilityState.selected`, so a reader says "selected"
 *              rather than the user having to perceive a disc. The disc is the redundant,
 *              visual half of that signal — and it is a *shape* change, not a colour change,
 *              which is what makes it survive 1.4.1.
 *   targets    Every tab is at least 48dp tall and a quarter of the screen wide.
 *   contrast   White labels on the bar's lightest stop are 10.2:1. The selected icon is the
 *              brand red on its own 50 tint, 4.27:1 — over the 3:1 that 1.4.11 asks of a
 *              glyph, and it sits on a disc whose edge is 8.5:1 against the slab, so the
 *              selected tab is findable without resolving the icon at all.
 *
 * ## It still gets out of the way of the keyboard
 *
 * `tabBarHideOnKeyboard` is implemented inside React Navigation's *own* bar, so handing the
 * navigator a custom one silently drops it — and a bar pinned over the keyboard sits on top of
 * the field being typed into on the search and request forms. So the behaviour is reimplemented
 * here, and it still reads the option off the focused screen rather than being unconditional,
 * so the layout file's `tabBarHideOnKeyboard: true` continues to mean something.
 *
 * ## Why the height is computed rather than a constant
 *
 * The bar carries text, so it has to grow when text grows — a fixed 78px bar clips its labels
 * at 200% OS text size, which is exactly the failure the rest of this app is built to avoid.
 * `useTabBarHeight` is the single number both this component and the navigator use, so the
 * height React Navigation reports for the bar is the height the bar actually is.
 */

/** The pale disc behind the selected tab's icon. */
const DISC = 52;
/** Where the disc starts, below the bar's top edge. The rounded corners clip this row, so
 *  nothing may hang above it — a disc riding over the top edge would be sliced off. */
const DISC_TOP = 6;
const LABEL_GAP = 2;
/** Breathing room under the label, above the home-indicator inset. */
const BOTTOM_PAD = spacing.sm;

/**
 * The bar's height above the safe-area inset, at the current text size.
 *
 * Both the OS setting and the in-app "big text" preference are counted, because they stack —
 * see `a11y.bigTextScale`. The OS component is capped the same way `AppText` caps it.
 */
/**
 * Whether a keyboard is currently up.
 *
 * `will` on iOS and `did` on Android, which is the split React Navigation's own hook makes: iOS
 * fires the `will` events with the animation and Android does not fire them at all.
 */
function useIsKeyboardShown() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setShown(true),
    );
    const hide = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setShown(false),
    );

    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return shown;
}

export function useTabBarHeight() {
  const { fontScale } = useWindowDimensions();
  const bigText = usePreference('bigText');

  const scale =
    Math.min(fontScale || 1, a11y.maxFontSizeMultiplier) * (bigText ? a11y.bigTextScale : 1);
  const labelBlock = Math.round(typography.footnote.lineHeight * scale);

  return Math.max(
    a11y.minTouchTarget + BOTTOM_PAD,
    DISC_TOP + DISC + LABEL_GAP + labelBlock + BOTTOM_PAD,
  );
}

/**
 * @param state       the navigator's state — `routes` and `index`.
 * @param descriptors keyed by route key; each one's `options` supply the title and the
 *                    accessibility label the screen declared.
 * @param navigation  used rather than the router, so switching tabs keeps each tab's own
 *                    stack where it was.
 * @param tabs        `{ name, label, icon, accessibilityLabel }` in bar order. Passed in
 *                    rather than read off the navigator because the navigator also holds the
 *                    routes that are deliberately *off* the bar (`href: null`).
 */
export function BottomTabBar({ state, descriptors, navigation, tabs }) {
  const insets = useSafeAreaInsets();
  const height = useTabBarHeight();
  const keyboardShown = useIsKeyboardShown();

  const activeRoute = state.routes[state.index]?.name;
  const focusedKey = state.routes[state.index]?.key;
  const hideOnKeyboard = descriptors?.[focusedKey]?.options?.tabBarHideOnKeyboard ?? false;

  function go(name) {
    if (name === activeRoute) return;
    hapticTap();
    navigation.navigate(name);
  }

  // Unmounted rather than translated off-screen: there is nothing to animate against here, and
  // leaving it mounted under the keyboard would keep four tabs in the accessibility tree
  // underneath the field the user is typing into.
  if (hideOnKeyboard && keyboardShown) return null;

  return (
    <Gradient
      stops={colors.gradientBar}
      // Under high contrast the bar flattens to its own darkest stop rather than to the brand
      // fill every other band uses — see `Gradient`. White on it is 19:1.
      flatColor={colors.barDark}
      style={[
        styles.bar,
        { height: height + insets.bottom, paddingBottom: insets.bottom },
      ]}
    >
      {tabs.map((tab) => {
        const focused = tab.name === activeRoute;

        return (
          <Pressable
            key={tab.name}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={tab.accessibilityLabel ?? tab.label}
            onPress={() => go(tab.name)}
            style={({ pressed }) => [styles.tab, pressed && styles.tabPressed]}
          >
            {focused ? (
              <View style={styles.disc}>
                <Icon name={tab.icon} size={24} color={colors.primary} />
              </View>
            ) : (
              <View style={styles.iconWell}>
                <Icon name={tab.icon} size={22} color={colors.onPrimary} />
              </View>
            )}

            <AppText
              variant="footnote"
              weight={focused ? 'semibold' : 'body'}
              color={colors.onPrimary}
              align="center"
              numberOfLines={1}
              style={styles.label}
            >
              {tab.label}
            </AppText>
          </Pressable>
        );
      })}
    </Gradient>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    minHeight: a11y.minTouchTarget,
  },
  // A pressed tab dims rather than changing colour: the bar is already near-black, so there
  // is no darker fill available to press into.
  tabPressed: { opacity: 0.7 },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryTint,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: DISC_TOP,
  },
  /**
   * An unselected tab's icon occupies the same vertical slot the disc does, so the labels of
   * all four tabs sit on one line. Centring the icon inside the disc's footprint rather than
   * padding above it is what keeps that true when the label wraps to a second line.
   */
  iconWell: {
    height: DISC,
    marginTop: DISC_TOP,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { marginTop: LABEL_GAP, paddingHorizontal: 2 },
});

export default BottomTabBar;
