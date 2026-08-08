import { useMemo } from 'react';
import { Text } from 'react-native';
import { usePreferencesSnapshot } from '../hooks/usePreferences';
import { colors, typography, a11y, highContrast } from '../theme';

/**
 * Every piece of text in the app goes through here.
 *
 * Three reasons it exists rather than screens using `Text` directly:
 *
 *  1. Font scaling. `allowFontScaling` is left at its default `true` — deliberately, and
 *     it must stay that way. Turning it off is the single most common accessibility bug in
 *     React Native apps: it silently ignores a low-vision user's OS text-size setting, and
 *     it is invisible to anyone testing at default size. `maxFontSizeMultiplier` caps the
 *     growth at 2x so layouts do not shear apart, which is a ceiling, not a limit on how
 *     small text can be made to look.
 *
 *  2. `accessibilityRole="header"` on headings. Screen-reader users navigate long screens by
 *     jumping heading to heading (the VoiceOver rotor, TalkBack's heading navigation). Text
 *     that only *looks* like a heading is not one, so the `variant` decides the role.
 *
 *  3. The "big text" and "high contrast" preferences (Phase 11). Both are applied here, once,
 *     rather than by each screen — which is the difference between a preference that works
 *     everywhere and one that works on the screens somebody remembered to update.
 *
 * ## How the two preferences apply
 *
 * **Big text** multiplies the base size *and* the line height. Scaling the size alone is the
 * classic mistake: the glyphs grow, the leading does not, and descenders start colliding with
 * the line below — text that is larger and harder to read than before.
 *
 * **High contrast** substitutes the muted colours for full-contrast ones. The substitution is
 * keyed by the exact colour the caller passed, so `colors.textMuted` becomes near-black on the
 * light surface and `colors.onBrandMuted` becomes white on the red one. Doing it by lookup
 * rather than "if muted then dark" is what keeps the brand screens from turning into dark ink
 * on deep red, which would be less readable, not more.
 *
 * A colour passed in a `style` prop bypasses this, which is why components pass `color` and
 * not `style={{ color }}`.
 */

const HEADING_VARIANTS = new Set(['display', 'title', 'heading', 'subheading']);

export function AppText({
  variant = 'body',
  color,
  align,
  style,
  children,
  // A heading that should not be exposed as one — rare, but a card title inside a list item
  // that is already grouped is noise in the rotor.
  role,
  // React 19 passes `ref` as an ordinary prop to function components, so no forwardRef is
  // needed. Named explicitly rather than left to fall through `...rest`, because screens
  // rely on it: this is the ref `useHeadingFocus` attaches to move the reader to a heading.
  ref,
  ...rest
}) {
  const { bigText, highContrast: hc } = usePreferencesSnapshot();

  const base = typography[variant] ?? typography.body;
  const isHeading = HEADING_VARIANTS.has(variant);

  const scaled = useMemo(() => {
    if (!bigText) return base;
    return {
      ...base,
      fontSize: Math.round(base.fontSize * a11y.bigTextScale),
      lineHeight: Math.round(base.lineHeight * a11y.bigTextScale),
    };
  }, [base, bigText]);

  const resolved = color ?? colors.text;
  const finalColor = hc ? (highContrast.text[resolved] ?? resolved) : resolved;

  return (
    <Text
      ref={ref}
      accessibilityRole={role ?? (isHeading ? 'header' : undefined)}
      maxFontSizeMultiplier={a11y.maxFontSizeMultiplier}
      style={[scaled, { color: finalColor }, align ? { textAlign: align } : null, style]}
      {...rest}
    >
      {children}
    </Text>
  );
}

export default AppText;
