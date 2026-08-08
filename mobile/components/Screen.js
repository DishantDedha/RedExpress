import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../theme';

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
 * ## Tone
 *
 * `tone="brand"` paints the screen deep red edge to edge, which is how the mockups draw
 * everything before sign-in. It is a prop rather than a per-screen style block so the
 * foreground colours come as a set: a screen cannot end up red with the default dark body
 * text on it, which is the failure mode this guards against. On a brand screen use
 * `colors.onPrimary` for anything that matters and `colors.onBrandMuted` for supporting
 * copy — nothing from the light-surface set is readable there.
 *
 * The status bar flips to light content to match, because dark status-bar glyphs on the red
 * fill are barely visible.
 */

/**
 * Header options for a navigator whose screens are brand-red.
 *
 * The native header is kept for its back button — React Navigation labels it correctly for
 * both screen readers and it honours the platform back gesture, neither of which a
 * hand-drawn chevron does. It is only restyled, so the arrow is white on red like the
 * mockups rather than a light-grey bar sitting above a red screen.
 */
export const brandHeaderOptions = {
  headerShown: true,
  headerTitle: '',
  headerTintColor: colors.onPrimary,
  headerStyle: { backgroundColor: colors.brand },
  headerShadowVisible: false,
  headerBackTitleStyle: typography.body,
  contentStyle: { backgroundColor: colors.brand },
};

export function Screen({
  children,
  footer,
  scrollable = true,
  /** 'default' — grey app surface. 'brand' — full-bleed red, for the pre-sign-in screens. */
  tone = 'default',
  /** Turn off when the screen manages its own horizontal padding, e.g. a full-bleed list. */
  padded = true,
  contentContainerStyle,
  style,
  ...rest
}) {
  const insets = useSafeAreaInsets();
  const brand = tone === 'brand';

  const content = scrollable ? (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[
        styles.grow,
        padded && styles.padded,
        // Bottom padding so the last field is not pinned under the footer or the home bar.
        { paddingBottom: spacing.xxl + (footer ? 0 : insets.bottom) },
        contentContainerStyle,
      ]}
      // A tap on a button while the keyboard is open should press the button, not just
      // dismiss the keyboard and make the user tap twice.
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      {...rest}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.flex, padded && styles.padded, contentContainerStyle]} {...rest}>
      {children}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.root, brand && styles.rootBrand, { paddingTop: insets.top }, style]}
      // iOS needs 'padding'; on Android the OS resizes the window itself and 'padding' on top
      // of that double-counts, leaving a gap above the keyboard.
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Mounted per screen so the bar follows the surface it sits on. */}
      <StatusBar style={brand ? 'light' : 'dark'} />

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
  rootBrand: { backgroundColor: colors.brand },
  flex: { flex: 1 },
  // Lets a screen centre its content vertically (the landing hero) while still scrolling
  // once the text outgrows the viewport.
  grow: { flexGrow: 1 },
  padded: { paddingHorizontal: spacing.lg, paddingTop: spacing.lg },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.borderMuted,
  },
  // No divider on red: a white hairline would read as a seam across a full-bleed screen.
  footerBrand: { backgroundColor: colors.brand, borderTopWidth: 0 },
});

export default Screen;
