import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, spacing } from '../theme';

/**
 * The heading above a group of cards or tiles.
 *
 * ## It is GMP's section heading
 *
 * Playfair Display, uppercased, 18px, with an optional line of explanation under it and a
 * "View all" link pushed to the right — the same heading that app uses above every shelf of
 * its catalogue, and the single strongest piece of its visual identity after the red itself.
 *
 * The title is set in caps by the component rather than written in caps by the caller, for
 * two reasons: a caller who types "YOUR REQUESTS" leaves nothing readable for the reader to
 * announce, and `textTransform` keeps the prop a sentence so the accessible name stays one.
 *
 * ## A real heading, not text that looks like one
 *
 * `AppText`'s `sectionTitle` variant carries `accessibilityRole="header"`, which is what puts
 * it in the rotor. Screen-reader users navigate a long screen by jumping heading to heading,
 * and a home screen with one heading at the top and eight unlabelled groups below it is a
 * screen you have to swipe through linearly. This is what makes the screens skimmable by ear
 * as well as by eye.
 *
 * Caps are announced from the `accessibilityLabel`, which is the untransformed title. Short
 * all-caps strings are a speech hazard — VoiceOver and TalkBack both tend to spell them out —
 * and `textTransform` is not reliably stripped before the string reaches the reader.
 *
 * ## The eyebrow
 *
 * `overline` is the small spaced-capitals line above the title. Decoration, since the heading
 * underneath says the same thing in more words, so it is hidden from the accessibility tree
 * rather than given a sentence-case label that would only duplicate the heading.
 *
 * ## The two trailing forms
 *
 * `onViewAll` is GMP's: a plain red "View all" link, which is what nearly every section wants
 * and which no longer has to be assembled from an `AppButton` at each call site. `action`
 * remains for the rest — anything that is not a "see the whole list" link. Either stays a
 * sibling of the heading rather than being folded into it, so it is a separate focus stop with
 * its own role.
 */
export function SectionHeading({
  title,
  overline,
  description,
  /** Shows GMP's "View all" link on the right. */
  onViewAll,
  /** What the link leads to, for the reader: "all of your blood requests". */
  viewAllLabel,
  /** An arbitrary trailing control, when "View all" is not what the section needs. */
  action,
  style,
}) {
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

          <AppText
            variant="sectionTitle"
            // The untransformed title. What the eye reads is set in caps by the style below;
            // what the reader says is the sentence.
            accessibilityLabel={title}
            style={styles.title}
          >
            {title}
          </AppText>
        </View>

        {onViewAll ? (
          <Pressable
            onPress={onViewAll}
            accessibilityRole="button"
            accessibilityLabel={viewAllLabel ? `View all ${viewAllLabel}` : 'View all'}
            hitSlop={spacing.md}
            style={({ pressed }) => [styles.action, pressed && styles.actionPressed]}
          >
            <AppText variant="label" color={colors.primary}>
              View all
            </AppText>
          </Pressable>
        ) : action ? (
          <View style={styles.action}>{action}</View>
        ) : null}
      </View>

      {description ? (
        <AppText variant="footnote" color={colors.textMuted} style={styles.description}>
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
    // Wraps rather than crushing the action when the OS font size is turned up.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  titleColumn: { flexShrink: 1 },
  title: { textTransform: 'uppercase' },
  overline: { marginBottom: 2 },
  action: { flexShrink: 0 },
  actionPressed: { opacity: 0.6 },
  description: { marginTop: spacing.xs },
});

export default SectionHeading;
