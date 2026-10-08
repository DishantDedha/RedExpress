import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { AppText } from './AppText';
import { Icon } from './Icon';
import { useHeadingFocus } from '../hooks/useAccessibilityFocus';
import { useScreenIntroduction } from '../hooks/useVoiceGuidance';
import { a11y, colors, radius, spacing } from '../theme';

/**
 * The title block at the top of every screen — and the thing that moves screen-reader focus
 * there when the screen opens.
 *
 * ## The two layouts
 *
 * **`bar`** is GMP's screen header, and it is what most screens should use: a compact flat red
 * strip with a 36px white circular back button and a 20px white title on one line. It is about
 * 60px tall above the safe area.
 *
 * **`block`** is the tall version, for the three screens that are a statement rather than a
 * destination — Home, the landing, and the sign-in flow. A 24px title, a line of supporting
 * copy under it, and room for whatever the screen puts below (a search box, chips, a logo).
 *
 * The app used `block` everywhere, and that was the single biggest reason it looked heavy. A
 * 24px title plus a sentence of subtitle plus 56px of top padding is 140px of chrome on a
 * screen whose job is to show a list — on a short phone, a third of the viewport spent
 * restating the name of the thing you just tapped.
 *
 * ## Focus and voice are built in, in both layouts
 *
 * Focus-on-mount is here rather than left to each screen to remember, because "set initial
 * accessibility focus to the heading" is a requirement on *every* screen in this app and a
 * per-screen `useEffect` is a requirement that gets forgotten on screen eleven. Render a
 * `ScreenHeader` and the behaviour is there.
 *
 * `autoFocus={false}` exists for the rare screen that should send focus somewhere else — a
 * results screen where the count matters more than the title.
 *
 * The subtitle is deliberately *not* part of the focused element. Grouping them would make
 * the reader recite a paragraph before the user can move on; as a separate node it is one
 * swipe away for anyone who wants it.
 *
 * `voicePurpose` and `voiceAction` are what the screen says about itself when the voice
 * guidance preference is on and no screen reader is running. They live here for the same
 * reason focus-on-mount does. The purpose is written for the ear, not copied from the
 * subtitle: the subtitle is skimmed, this is heard once, so it says what the screen is *for* —
 * "Search for donors by blood group and area" — and names the one action that matters.
 *
 * ## `actions`
 *
 * The controls on the right of the title row — a bell, an avatar, a filter button. GMP puts
 * them there on every screen, and having a slot for them is what stopped the home screen
 * pinning its avatar over the band with `position: absolute` and reserving a right-hand gutter
 * by hand so that a long name would wrap beside it.
 *
 * They render after the title in source order, which is also the order a screen reader
 * reaches them: the screen says what it is before it offers its controls.
 */
export function ScreenHeader({
  title,
  subtitle,
  /** 'bar' — GMP's compact red strip. 'block' — the tall hero version. */
  layout = 'block',
  /** Overrides what the reader says, when the visible title is too terse out of context. */
  accessibilityLabel,
  autoFocus = true,
  /** Spoken under voice guidance: what this screen is for, in one short sentence. */
  voicePurpose,
  /** Spoken under voice guidance: the primary thing to do here. */
  voiceAction,
  align = 'left',
  /**
   * Match the `Screen` this sits on: 'brand' inverts the text for the red surface. A `bar`
   * is always on red, so it ignores this.
   */
  tone = 'default',
  /** Controls on the right of the title row — a bell, an avatar, a filter button. */
  actions,
  /**
   * Show the circular back button on a `bar`. Off for a tab, which has nothing to go back to;
   * on for a pushed screen. Pass a string to go somewhere specific rather than popping.
   */
  back = false,
  style,
  children,
}) {
  const headingRef = useHeadingFocus({ enabled: autoFocus });
  const router = useRouter();
  const bar = layout === 'bar';
  const brand = bar || tone === 'brand';

  useScreenIntroduction({
    title: accessibilityLabel ?? title,
    // Falls back to the subtitle so a screen that has not been given bespoke voice copy still
    // says something useful rather than only its name.
    purpose: voicePurpose ?? subtitle,
    action: voiceAction,
  });

  const backButton = back ? (
    <Pressable
      onPress={() => (typeof back === 'string' ? router.push(back) : router.back())}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      // The disc is 36 across because that is what GMP draws; hitSlop takes the target the rest
      // of the way to 48 without making the chrome taller.
      hitSlop={(a11y.minTouchTarget - BACK_DISC) / 2}
      style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
    >
      {/* Decorative — the button's own label says what it does. */}
      <Icon name="chevron" size={18} color={colors.text} style={styles.backGlyph} />
    </Pressable>
  ) : null;

  const heading = (
    <AppText
      ref={headingRef}
      variant={bar ? 'heading' : 'title'}
      align={bar ? 'left' : align}
      color={brand ? colors.onPrimary : colors.text}
      accessibilityRole="header"
      accessibilityLabel={accessibilityLabel ?? title}
      // Lets the reader stop on the heading even before it has been focused programmatically.
      accessible
      numberOfLines={bar ? 2 : undefined}
      style={bar ? styles.barTitle : undefined}
    >
      {title}
    </AppText>
  );

  if (bar) {
    return (
      <View style={[styles.bar, style]}>
        {backButton}
        {heading}
        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>
    );
  }

  return (
    <View style={[styles.block, style]}>
      {/*
        On a block the button sits above the title rather than beside it, because a band's title
        is 24px over two lines and a 36px disc on the same row would push it into a third.
        It used to be the stack's own native header, drawn transparent so it floated over the
        band — which meant the band had to carry 56px of top padding to keep the title out from
        under an arrow sitting exactly where the title wanted to be.
      */}
      {back ? <View style={styles.blockBack}>{backButton}</View> : null}

      <View style={styles.titleRow}>
        <View style={styles.titleColumn}>
          {heading}

          {subtitle ? (
            // 14, not 16. A subtitle at body size reads as a second heading and, on a red
            // band, as two competing white paragraphs — GMP's is a caption, and the band is
            // calmer for it.
            <AppText
              variant="caption"
              color={brand ? colors.onBrandMuted : colors.textMuted}
              align={align}
              style={styles.subtitle}
            >
              {subtitle}
            </AppText>
          ) : null}
        </View>

        {actions ? <View style={styles.actions}>{actions}</View> : null}
      </View>

      {children}
    </View>
  );
}

/** The white circle behind the back chevron. GMP's is 36. */
const BACK_DISC = 36;

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    // No vertical padding of its own: `Screen` supplies it along with the safe-area inset, so
    // the red strip is a single surface rather than a padded box inside one.
  },
  barTitle: { flex: 1 },
  back: {
    width: BACK_DISC,
    height: BACK_DISC,
    borderRadius: radius.pill,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backPressed: { backgroundColor: colors.primaryTint },
  // The icon set only draws a right-pointing chevron; flipping it is cheaper than a new glyph.
  backGlyph: { transform: [{ rotate: '180deg' }] },

  block: { marginBottom: spacing.xl },
  blockBack: { alignSelf: 'flex-start', marginBottom: spacing.lg },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  // `flex: 1` rather than `flexShrink`, so the title column claims the row and a long name
  // wraps *beside* the actions instead of pushing them off the edge.
  titleColumn: { flex: 1 },
  subtitle: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, flexShrink: 0 },
});

export default ScreenHeader;
