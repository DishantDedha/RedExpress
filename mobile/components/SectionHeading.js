import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, spacing } from '../theme';

/**
 * The heading above a group of cards or tiles.
 *
 * A real heading, not text that looks like one: `AppText`'s `heading` variant carries
 * `accessibilityRole="header"`, which is what puts it in the rotor. Screen-reader users
 * navigate a long screen by jumping heading to heading, and a home screen with one heading at
 * the top and eight unlabelled groups below it is a screen you have to swipe through
 * linearly. This is what makes the redesigned screens skimmable by ear as well as by eye.
 *
 * ## The eyebrow
 *
 * `overline` is the small spaced-capitals line above the title. Short all-caps strings are a
 * speech hazard — VoiceOver and TalkBack both tend to spell them out letter by letter — and
 * it is decoration in any case, since the heading underneath says the same thing in more
 * words. So it is hidden from the accessibility tree rather than given a sentence-case label
 * that would only duplicate the heading.
 *
 * `action` is an optional control on the right, typically a `link` AppButton ("See all").
 * It stays a sibling of the heading rather than being folded into it, so it is a separate
 * focus stop with its own role.
 */
export function SectionHeading({ title, overline, description, action, style }) {
  return (
    <View style={[styles.container, style]}>
      <View style={styles.row}>
        <View style={styles.titleColumn}>
          {overline ? (
            <AppText
              variant="overline"
              color={colors.primary}
              // Decorative — the heading below repeats it in speakable form.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
              style={styles.overline}
            >
              {overline}
            </AppText>
          ) : null}

          <AppText variant="heading">{title}</AppText>
        </View>

        {action ? <View style={styles.action}>{action}</View> : null}
      </View>

      {description ? (
        <AppText variant="caption" color={colors.textMuted} style={styles.description}>
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: spacing.md },
  row: {
    flexDirection: 'row',
    // Wraps rather than crushing the action button when the OS font size is turned up.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleColumn: { flexShrink: 1 },
  overline: { marginBottom: 2 },
  action: { flexShrink: 0 },
  description: { marginTop: spacing.xs },
});

export default SectionHeading;
