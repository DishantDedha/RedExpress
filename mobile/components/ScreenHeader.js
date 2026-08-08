import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useHeadingFocus } from '../hooks/useAccessibilityFocus';
import { useScreenIntroduction } from '../hooks/useVoiceGuidance';
import { colors, spacing } from '../theme';

/**
 * The title block at the top of every screen — and the thing that moves screen-reader focus
 * there when the screen opens.
 *
 * Focus-on-mount is built in rather than left to each screen to remember, because "set
 * initial accessibility focus to the heading" is a requirement on *every* screen in this app
 * and a per-screen `useEffect` is a requirement that gets forgotten on screen eleven. Render
 * a `ScreenHeader` and the behaviour is there.
 *
 * `autoFocus={false}` exists for the rare screen that should send focus somewhere else — a
 * results screen where the count matters more than the title (Phase 10).
 *
 * The subtitle is deliberately *not* part of the focused element. Grouping them would make
 * the reader recite a paragraph before the user can move on; as a separate node it is one
 * swipe away for anyone who wants it.
 *
 * ## Voice guidance (Phase 11)
 *
 * `voicePurpose` and `voiceAction` are what the screen says about itself when the voice
 * guidance preference is on and no screen reader is running. They live here, on the component
 * every screen already renders, for the same reason focus-on-mount does: a per-screen hook is
 * a step that gets forgotten on screen eleven.
 *
 * The purpose is written for the ear, not copied from the subtitle. The subtitle is skimmed;
 * this is heard once, so it says what the screen is *for* — "Search for donors by blood group
 * and area" — and names the one action that matters.
 */
export function ScreenHeader({
  title,
  subtitle,
  /** Overrides what the reader says, when the visible title is too terse out of context. */
  accessibilityLabel,
  autoFocus = true,
  /** Spoken under voice guidance: what this screen is for, in one short sentence. */
  voicePurpose,
  /** Spoken under voice guidance: the primary thing to do here. */
  voiceAction,
  align = 'left',
  /** Match the `Screen` this sits on: 'brand' inverts the text for the red surface. */
  tone = 'default',
  style,
  children,
}) {
  const headingRef = useHeadingFocus({ enabled: autoFocus });
  const brand = tone === 'brand';

  useScreenIntroduction({
    title: accessibilityLabel ?? title,
    // Falls back to the subtitle so a screen that has not been given bespoke voice copy still
    // says something useful rather than only its name.
    purpose: voicePurpose ?? subtitle,
    action: voiceAction,
  });

  return (
    <View style={[styles.container, style]}>
      <AppText
        ref={headingRef}
        variant="title"
        align={align}
        color={brand ? colors.onPrimary : colors.text}
        accessibilityRole="header"
        accessibilityLabel={accessibilityLabel ?? title}
        // Lets the reader stop on the heading even before it has been focused
        // programmatically.
        accessible
      >
        {title}
      </AppText>

      {subtitle ? (
        <AppText
          variant="body"
          color={brand ? colors.onBrandMuted : colors.textMuted}
          align={align}
          style={styles.subtitle}
        >
          {subtitle}
        </AppText>
      ) : null}

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.xl },
  subtitle: { marginTop: spacing.sm },
});

export default ScreenHeader;
