import { PixelRatio, StyleSheet, Text, View } from 'react-native';
import { usePreferencesSnapshot } from '../hooks/usePreferences';
import { colors, a11y } from '../theme';

/**
 * A circle with someone's initials in it.
 *
 * Decorative, and hidden from the accessibility tree outright. It sits beside the person's
 * name everywhere it is used, so announcing "R K" before "Ravi Kumar" would be two stops to
 * learn one thing — and initials read aloud are close to noise.
 *
 * The initials are derived here rather than passed in, so there is one rule for what they
 * are: the first letter of the first word and the first letter of the last, which handles
 * "Ravi Kumar" and "Ravi" alike and falls back to a dot rather than an empty circle when
 * there is no name yet.
 *
 * ## Font scaling, and the one place this app turns it off
 *
 * `AppText` exists partly to guarantee that no text in this app ignores the OS text-size
 * setting, and `allowFontScaling={false}` is called out in its header as the most common
 * accessibility bug in React Native. This component uses it, which needs justifying.
 *
 * The problem: the glyph lives inside a circle with a diameter in dp. Let the text scale and
 * it grows out of a container that did not; the initials clip, and at 200% the circle
 * contains a fragment of a letter.
 *
 * The fix is not to ignore the setting but to apply it to the *whole component*. The circle
 * is measured against `PixelRatio.getFontScale()` and the in-app big-text preference, and
 * the glyph is then sized as a fixed fraction of that already-scaled diameter. Both grow
 * together, so nothing clips at any setting, and `allowFontScaling` is off only because the
 * scaling has already been done by hand one level up.
 *
 * Growth is capped at 1.4x rather than the usual 2x, and that cap costs nobody information:
 * this element is hidden from screen readers, the initials are redundant with the name
 * rendered beside it, and that name scales all the way to 200% as normal. The cap is on
 * decoration only.
 */

export function initialsOf(name) {
  const words = String(name ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return '';
  if (words.length === 1) return words[0].slice(0, 1).toUpperCase();

  return (words[0].slice(0, 1) + words[words.length - 1].slice(0, 1)).toUpperCase();
}

const TONES = {
  /** On a white surface. 8.51:1. */
  tint: { bg: colors.primaryTint, fg: colors.primaryOnTint },
  /** On the red hero band, where a tinted circle would disappear into it. */
  onBrand: { bg: 'rgba(255, 255, 255, 0.2)', fg: colors.onPrimary },
  solid: { bg: colors.primary, fg: colors.onPrimary },
};

/** How far the circle is allowed to grow. Decoration only — see the header. */
const MAX_AVATAR_SCALE = 1.4;

export function Avatar({ name, size = 48, tone = 'tint', style }) {
  const { bigText } = usePreferencesSnapshot();
  const palette = TONES[tone] ?? TONES.tint;
  const initials = initialsOf(name);

  const requested = PixelRatio.getFontScale() * (bigText ? a11y.bigTextScale : 1);
  const scale = Math.min(requested, MAX_AVATAR_SCALE);
  const diameter = Math.round(size * scale);

  return (
    <View
      // Decorative. The name is always rendered next to this.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.avatar,
        {
          width: diameter,
          height: diameter,
          borderRadius: diameter / 2,
          backgroundColor: palette.bg,
        },
        style,
      ]}
    >
      {initials ? (
        <Text
          // Off deliberately, and only because the diameter above has already absorbed the
          // user's setting. See the header — this is the single exception in the app.
          allowFontScaling={false}
          style={[
            styles.initials,
            {
              color: palette.fg,
              fontSize: Math.round(diameter * 0.36),
              lineHeight: Math.round(diameter * 0.44),
            },
          ]}
        >
          {initials}
        </Text>
      ) : (
        // No name to work from yet. A dot rather than an empty ring, so the row keeps its
        // leading shape and does not jump sideways once the profile loads.
        <View
          style={{
            width: diameter * 0.22,
            height: diameter * 0.22,
            borderRadius: diameter * 0.11,
            backgroundColor: palette.fg,
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initials: { textAlign: 'center', fontWeight: '700' },
});

export default Avatar;
