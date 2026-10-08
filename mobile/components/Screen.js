import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gradient } from './Gradient';
import { colors, spacing, radius } from '../theme';

/**
 * The page frame: safe-area padding, keyboard avoidance, and a scroll container.
 *
 * The scroll container is not optional decoration. At 200% OS text size a form that fits on
 * one screen at default size does not, and a fixed-height layout simply cuts the last field
 * off — the classic font-scaling failure. Everything scrolls by default, so growing text
 * pushes content down instead of off.
 *
 * `footer` pins a primary action to the bottom (the "Send OTP" button on the phone screen)
 * while the content above it still scrolls. It sits outside the ScrollView so it stays
 * reachable, and gets its own safe-area padding so it clears the home indicator.
 *
 * ## The four surfaces
 *
 * **`bar`** is the one to reach for, and it is GMP's. A compact flat red strip at the top
 * carrying the screen's title, pinned above the content rather than scrolling with it, and
 * everything else on the page below. About 60px of chrome instead of 140.
 *
 * **`hero`** is the tall version: a red gradient band carrying a title, a line of copy and
 * whatever the screen puts under them, with a white sheet tucked below it on rounded top
 * corners. For the three screens that are a statement rather than a destination — Home, the
 * landing, the sign-in flow.
 *
 * **`tone="brand"`** paints the whole screen red, for a screen that is almost entirely one
 * statement.
 *
 * **The default** is the plain page with no chrome of its own.
 *
 * `page="muted"` switches the page from white to neutral-100, which is what a screen made of
 * full-bleed `RowBlock`s wants: there, the 8px of page showing between two blocks *is* the
 * separator, and on white there would be nothing to see.
 *
 * Tone and page are props rather than per-screen style blocks so the foreground colours come
 * as a set: a screen cannot end up red with the default dark body text on it, which is the
 * failure mode this guards against. On any red surface use `colors.onPrimary` for anything
 * that matters and `colors.onBrandMuted` for supporting copy — nothing from the light-surface
 * set is readable there.
 *
 * The status bar flips to light content on every red surface, because dark status-bar glyphs
 * on the red fill are barely visible.
 *
 * ## Why the bar is pinned and the band is not
 *
 * A `bar` is 60px of flat colour with one line of text in it. Pinned, it behaves like the
 * platform header it replaces: the title stays put, the list scrolls under it, and nothing
 * about the title's background changes as it goes.
 *
 * A `hero` cannot do that. It is a gradient, and content scrolling out from under a pinned
 * gradient means the screen's title slides off the red and onto the white sheet on the way
 * past, unreadable for the two hundred pixels it takes. So the band is an ordinary first child
 * of the scroll view and travels with its own background. The root is painted with the
 * gradient's lightest stop so an overscroll bounce at the top reveals red rather than a grey
 * seam.
 */

/**
 * Header options for a navigator whose screens carry a `bar` or a band.
 *
 * The native header used to be kept for its back button. It is not any more: a `bar` draws its
 * own, as GMP does, and two back affordances stacked over one strip of red is what the old
 * transparent-header arrangement actually produced. The native header is switched off and the
 * screen owns its chrome.
 *
 * Kept as an export because every `(auth)` and `(app)` stack screen references it, and because
 * `contentStyle` still matters: without it the stack animates a new screen in over a white
 * card, which flashes white down the side of a red bar mid-transition.
 */
export const brandHeaderOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: colors.gradientBrand[0] },
};

/**
 * The gap between the safe area and the first line of hero content.
 *
 * The native header used to float over the band, so this had to clear a back arrow drawn at
 * the safe-area inset — exactly where the title wanted to be. Now that the band's screens
 * draw no native header at all, this is simply a generous top margin, which is what a hero
 * band wants anyway.
 */
const HERO_TOP = spacing.xl;

/** Vertical padding inside the red `bar`, above and below its single row. */
const BAR_PAD = spacing.md;

export function Screen({
  children,
  footer,
  scrollable = true,
  /** 'default' — the light page. 'brand' — full-bleed red, for a screen that is one statement. */
  tone = 'default',
  /** 'white' or 'muted' (neutral-100, for a screen made of full-bleed `RowBlock`s). */
  page = 'white',
  /**
   * GMP's compact red strip at the top of the screen. Pass a `<ScreenHeader layout="bar" />`.
   * Pinned above the content rather than scrolling with it.
   */
  bar,
  /**
   * Content for the tall red gradient band. Everything in `children` then renders on the white
   * sheet below it.
   */
  hero,
  /**
   * Degrees of tilt on the gradient.
   *
   * 0 — a straight top-to-bottom fade, which is what GMP's headers are and what this defaults
   * to. It used to default to 14, and a tilted band is the kind of flourish that dates a
   * screen: the ramp runs diagonally across a title that is set horizontally, so the copy sits
   * on a different red at each end of the line for no reason anyone can name.
   */
  heroAngle = 0,
  /** Extra breathing room in the band, for a screen whose hero is a logo rather than a title. */
  heroPadding,
  /** Overrides the gap between the top of the screen and the hero content. See `HERO_TOP`. */
  heroTop,
  /** Turn off when the screen manages its own horizontal padding — a list of `RowBlock`s. */
  padded = true,
  contentContainerStyle,
  style,
  ...rest
}) {
  const insets = useSafeAreaInsets();
  const brand = tone === 'brand';
  const hasHero = Boolean(hero);
  const hasBar = Boolean(bar);
  // Every red surface needs light status-bar glyphs.
  const onRed = brand || hasHero || hasBar;
  const pageColor = page === 'muted' ? colors.pageMuted : colors.background;

  const body = (
    <>
      {hasHero ? (
        <Gradient
          angle={heroAngle}
          style={[
            styles.heroBand,
            {
              paddingTop: insets.top + (heroTop ?? HERO_TOP),
              // The sheet is pulled up by its own corner radius, so the band has to carry
              // that much extra or the curve eats into the hero's last line of text.
              paddingBottom: (heroPadding ?? spacing.xl) + radius.xxl,
            },
          ]}
        >
          <View style={styles.heroContent}>{hero}</View>
        </Gradient>
      ) : null}

      <View
        style={[
          styles.grow,
          hasHero && styles.sheet,
          hasHero && { backgroundColor: pageColor },
          padded && styles.sheetPadded,
        ]}
      >
        {children}
      </View>
    </>
  );

  const content = scrollable ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.grow,
        // With a hero the band and the sheet pad themselves; padding the container as well
        // would inset the band from the edges of the screen, which is the one thing a
        // full-bleed band must not be.
        !hasHero && padded && styles.padded,
        // The sheet supplies its own bottom padding; a plain screen needs it here, and both
        // need to clear the home indicator when there is no footer covering it.
        { paddingBottom: (hasHero ? 0 : spacing.xxl) + (footer ? 0 : insets.bottom) },
        contentContainerStyle,
      ]}
      // A tap on a button while the keyboard is open should press the button, not just
      // dismiss the keyboard and make the user tap twice.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      {...rest}
    >
      {hasHero ? body : children}
    </ScrollView>
  ) : (
    <View
      style={[styles.flex, !hasHero && padded && styles.padded, contentContainerStyle]}
      {...rest}
    >
      {hasHero ? body : children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[
        styles.root,
        { backgroundColor: pageColor },
        // Behind either tall red surface: the ramp's lightest stop, so an overscroll bounce
        // continues the band instead of exposing a seam above it.
        (brand || hasHero) && styles.rootRed,
        // A bar draws its own safe-area padding, and so does a band. Anything else needs it
        // here.
        !hasHero && !hasBar && { paddingTop: insets.top },
        style,
      ]}
      // iOS needs 'padding'; on Android the OS resizes the window itself and 'padding' on top
      // of that double-counts, leaving a gap above the keyboard.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Mounted per screen so the bar follows the surface it sits on. */}
      <StatusBar style={onRed ? 'light' : 'dark'} />

      {/* A full-bleed brand screen gets the ramp behind everything. `Gradient` hides its own
          band stack from screen readers. */}
      {brand ? (
        <Gradient angle={heroAngle} style={styles.brandBackdrop} pointerEvents="none" />
      ) : null}

      {hasBar ? (
        <Gradient
          angle={heroAngle}
          style={[styles.bar, { paddingTop: insets.top + BAR_PAD }]}
        >
          {bar}
        </Gradient>
      ) : null}

      {content}

      {footer ? (
        <View
          style={[
            styles.footer,
            brand && styles.footerBrand,
            { paddingBottom: spacing.lg + insets.bottom },
          ]}
        >
          {footer}
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  rootRed: { backgroundColor: colors.gradientBrand[0] },
  brandBackdrop: { ...StyleSheet.absoluteFillObject },
  flex: { flex: 1 },
  // Lets a screen centre its content vertically (the landing hero) while still scrolling
  // once the text outgrows the viewport.
  grow: { flexGrow: 1 },
  padded: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },

  /**
   * The red strip. Flat rather than a ramp in practice — over 60px a three-stop gradient is
   * indistinguishable from its own midpoint — but drawn with `Gradient` anyway so the bar, the
   * band and the full-bleed screens are the same red, and so high contrast flattens all three
   * through one code path.
   */
  bar: {
    paddingHorizontal: spacing.lg,
    paddingBottom: BAR_PAD,
  },

  heroBand: {
    paddingHorizontal: spacing.lg,
  },
  heroContent: {
    // Above the gradient's band stack, which is absolutely positioned behind it.
    position: 'relative',
  },
  /**
   * The white sheet. Pulled up over the band by exactly its own corner radius, so the curve
   * bites into the red rather than floating below it with a sliver of red showing through.
   */
  sheet: {
    borderTopLeftRadius: radius.xxl,
    borderTopRightRadius: radius.xxl,
    marginTop: -radius.xxl,
  },
  sheetPadded: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    paddingBottom: spacing.xxl,
  },

  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  // No divider on red: a white hairline would read as a seam across a full-bleed screen.
  footerBrand: { backgroundColor: 'transparent', borderTopWidth: 0 },
});

export default Screen;
