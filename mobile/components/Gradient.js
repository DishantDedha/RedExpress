import { StyleSheet, View } from 'react-native';
import { useHighContrast } from '../hooks/usePreferences';
import { colors, highContrast } from '../theme';

/**
 * A linear gradient, drawn with stacked bands.
 *
 * ## Why it is not a dependency
 *
 * `expo-linear-gradient` would do this in one line. It would also add a native module to an
 * app whose entire use of gradients is decorative — a band behind a heading. Bands are a few
 * dozen `View`s with interpolated background colours, they cost nothing, and they work
 * identically on both platforms and on web without a rebuild.
 *
 * The interpolation is done in sRGB, which is the "wrong" colour space in the sense that it
 * darkens slightly through the middle of a ramp. Between two reds a sixteenth of the way
 * apart in hue that is invisible, and correcting it would mean shipping a colour-space
 * conversion for decoration.
 *
 * ## Contrast
 *
 * A gradient under text is a contrast hazard: the ratio changes from the top of the band to
 * the bottom, and checking the midpoint tells you nothing about the ends. So the *stops* are
 * the checked unit, not the average — `scripts/check-contrast.mjs` measures white and
 * `onBrandMuted` against `red500` and `red900` individually, and the lightest stop is the
 * binding one. Every band in between is, by construction, darker than the lightest stop.
 *
 * That is also why the ramp may only be given colours from `colors.gradientBrand` in
 * practice: an arbitrary pair passed in from a screen is a pair nothing has measured.
 *
 * ## High contrast
 *
 * Collapses to a single flat fill. A user who turned this preference on to make text legible
 * is not helped by a background whose luminance slides underneath the caption they are
 * reading, and the flat fill (red700) puts white at 9.86:1 across the whole band rather than
 * 6.30:1 at its light end.
 */

const clamp = (n) => Math.max(0, Math.min(255, Math.round(n)));

function parse(hex) {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(from, to, t) {
  const a = parse(from);
  const b = parse(to);
  const channel = (i) => clamp(a[i] + (b[i] - a[i]) * t);
  return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

/**
 * The colour at position `t` (0…1) along a multi-stop ramp.
 * Stops are assumed evenly spaced, which is all this palette needs.
 */
function sample(stops, t) {
  if (stops.length === 1) return stops[0];

  const scaled = t * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  return mix(stops[index], stops[index + 1], scaled - index);
}

export function Gradient({
  /** Light stop to dark stop. Defaults to the measured brand ramp. */
  stops = colors.gradientBrand,
  /**
   * How many bands to draw. 24 is past the point where banding is visible at phone density
   * and still a trivial number of views.
   */
  steps = 24,
  /**
   * Degrees to rotate the ramp. 0 is a straight top-to-bottom fade; a small positive angle
   * gives the diagonal sweep the hero uses. The band stack is oversized and clipped, so the
   * corners stay filled at any angle.
   */
  angle = 0,
  children,
  style,
  ...rest
}) {
  const contrast = useHighContrast();

  if (contrast.on) {
    return (
      <View style={[styles.container, { backgroundColor: highContrast.gradient }, style]} {...rest}>
        {children}
      </View>
    );
  }

  const bands = [];
  for (let i = 0; i < steps; i += 1) {
    bands.push(
      <View
        key={i}
        style={[styles.band, { flex: 1, backgroundColor: sample(stops, i / (steps - 1)) }]}
      />,
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: stops[stops.length - 1] }, style]}
      {...rest}
    >
      {/*
        Purely decorative, and hidden outright on both platforms. Without this a screen
        reader on Android can stop on the band stack and announce nothing at all, which reads
        to the user as a dead element in the middle of the screen.
      */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={[styles.ramp, angle !== 0 && { transform: [{ rotate: `${angle}deg` }] }]}
      >
        {bands}
      </View>

      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // The children sit above the ramp, so the surface must clip it.
  container: { overflow: 'hidden', position: 'relative' },
  /**
   * Oversized and centred. At an angle the rotated rectangle's corners would otherwise pull
   * inside the container and leave untinted wedges; 200% on each axis covers any rotation.
   */
  ramp: {
    position: 'absolute',
    top: '-50%',
    left: '-50%',
    width: '200%',
    height: '200%',
  },
  band: { width: '100%' },
});

export default Gradient;
