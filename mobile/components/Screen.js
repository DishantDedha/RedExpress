import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Gradient } from './Gradient';
import { colors, spacing, radius, typography } from '../theme';

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
 * ## The three surfaces
 *
 * **`hero`** is the one to reach for. A red gradient band across the top carrying the
 * screen's title, and a white sheet tucked under it with rounded top corners holding
 * everything else. This is what makes the app white-and-red rather than red: the brand owns
 * a band, and the content — the part anyone has to read, fill in or scan — sits on white.
 *
 * **`tone="brand"`** paints the whole screen red, which is how the mockups drew everything
 * before sign-in. It is kept because it is still right for a screen that is almost entirely
 * one statement — and it now paints the gradient rather than a flat fill.
 *
 * **The default** is the plain light surface.
 *
 * Tone is a prop rather than a per-screen style block so the foreground colours come as a
 * set: a screen cannot end up red with the default dark body text on it, which is the
 * failure mode this guards against. On any red surface use `colors.onPrimary` for anything
 * that matters and `colors.onBrandMuted` for supporting copy — nothing from the
 * light-surface set is readable there.
 *
 * The status bar flips to light content on both red surfaces, because dark status-bar glyphs
 * on the red fill are barely visible.
 *
 * ## Why the band scrolls rather than staying put
 *
 * A pinned band with scrolling content underneath means the title slides off the red and
 * onto the white sheet on the way past, which is unreadable for the two hundred pixels it
 * takes. The band is an ordinary first child of the scroll view instead, so the title stays
 * on its own background for its whole travel. The root is painted with the gradient's
 * lightest stop so an overscroll bounce at the top reveals red rather than a grey seam.
 */

/**
 * Header options for a navigator whose screens carry a red band.
 *
 * The native header is kept for its back button — React Navigation labels it correctly for
 * both screen readers and it honours the platform back gesture, neither of which a
 * hand-drawn chevron does. It is only restyled: transparent, so it floats over the band
 * rather than sitting as a separate bar above it, with a white arrow.
 */
export const brandHeaderOptions = {
  headerShown: true,
  headerTitle: '',
  headerTintColor: colors.onPrimary,
  headerTransparent: true,
  headerStyle: { backgroundColor: 'transparent' },
  headerShadowVisible: false,
  headerBackTitleStyle: typography.body,
  contentStyle: { backgroundColor: colors.gradientBrand[0] },
};

/**
 * The gap between the safe area and the first line of hero content.
 *
 * Sized to clear a floating back button rather than to look right on its own. Most screens
 * with a band are pushed ones, and `brandHeaderOptions` makes their native header transparent
 * so the arrow sits *over* the band — at the safe-area inset, which is exactly where a title
 * would otherwise be drawn. 56 puts the title clear of a 44pt header with room to spare.
 *
 * The tab screens and the landing have no header and get the same value. On those it is
 * simply a generous top margin, which is what a hero band wants anyway.
 */
const HERO_TOP = spacing.xxl + spacing.xl;

export function Screen({
  children,
  footer,
  scrollable = true,
  /** 'default' — light app surface. 'brand' — full-bleed red, for a screen that is one statement. */
  tone = 'default',
  /**
   * Content for the red gradient band at the top of the screen. Everything in `children`
   * then renders on the white sheet below it.
   */
  hero,
  /** Degrees of tilt on the gradient. A small angle reads as depth; a large one as a stunt. */
  heroAngle = 14,
  /** Extra breathing room in the band, for a screen whose hero is a logo rather than a title. */
  heroPadding,
  /** Overrides the gap between the top of the screen and the hero content. See `HERO_TOP`. */
  heroTop,
  /** Turn off when the screen manages its own horizontal padding, e.g. a full-bleed list. */
  padded = true,
  contentContainerStyle,
  style,
  ...rest
}) {
  const insets = useSafeAreaInsets();
  const brand = tone === 'brand';
  const hasHero = Boolean(hero);
  // Both red surfaces need light status-bar glyphs and a red root, so the overscroll bounce
  // does not flash grey above the band.
  const onRed = brand || hasHero;

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

      <View style={[styles.grow, hasHero && styles.sheet, padded && styles.sheetPadded]}>
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
    <View style={[styles.flex, !hasHero && padded && styles.padded, contentContainerStyle]} {...rest}>
      {hasHero ? body : children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[
        styles.root,
        onRed && styles.rootRed,
        // The band draws its own safe-area padding; anything else needs it here.
        !hasHero && { paddingTop: insets.top },
        style,
      ]}
      // iOS needs 'padding'; on Android the OS resizes the window itself and 'padding' on top
      // of that double-counts, leaving a gap above the keyboard.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Mounted per screen so the bar follows the surface it sits on. */}
      <StatusBar style={onRed ? 'light' : 'dark'} />

      {/* A full-bleed brand screen gets the ramp behind everything, rather than the flat
          fill it used to have. `Gradient` hides its own band stack from screen readers. */}
      {brand ? <Gradient angle={heroAngle} style={styles.brandBackdrop} pointerEvents="none" /> : null}

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
  root: { flex: 1, backgroundColor: colors.background },
  // Behind either red surface: the ramp's lightest stop, so an overscroll bounce continues
  // the band instead of exposing a grey seam above it.
  rootRed: { backgroundColor: colors.gradientBrand[0] },
  brandBackdrop: { ...StyleSheet.absoluteFillObject },
  flex: { flex: 1 },
  // Lets a screen centre its content vertically (the landing hero) while still scrolling
  // once the text outgrows the viewport.
  grow: { flexGrow: 1 },
  padded: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },

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
    backgroundColor: colors.background,
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
