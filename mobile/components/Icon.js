import { StyleSheet, View } from 'react-native';

/**
 * The icon set, drawn from `View`s.
 *
 * ## Why not an icon font
 *
 * The app has no icon dependency and does not need one for twelve glyphs. A font would also
 * reintroduce a problem this codebase has already solved twice: glyphs that a screen reader
 * tries to pronounce. The CRM sidebar's `▤` and `✚` are literal characters, and every one of
 * them had to be wrapped in `aria-hidden`. These are `View`s. There is no character, so there
 * is nothing to mispronounce, and nothing to fall back to a tofu box when a font fails to
 * load.
 *
 * ## Every icon here is decorative
 *
 * Not "usually" — always. Each one is hidden from the accessibility tree at the root of this
 * component, on both platforms, and there is deliberately no prop to turn that off. An icon
 * in this app is always accompanied by its label: a tab has a visible title, a stat tile has
 * its name, a button has its text. An icon that needed its own label would be an icon
 * carrying meaning nothing else carries, which is the thing the rest of this app is built to
 * avoid.
 *
 * ## How the shapes are built
 *
 * Solid silhouettes, composed from rectangles, circles and rotated squares. The house is a
 * diamond overlapping a rectangle in the same colour; the tick is a square with two of its
 * four borders, rotated. Everything is expressed as a fraction of `size`, so an icon stays
 * proportional when the "big text" preference scales the row it sits in.
 */

export function Icon({ name, size = 24, color = '#000000', style }) {
  const Glyph = GLYPHS[name] ?? GLYPHS.drop;

  return (
    <View
      // Decorative, always. Both properties are set because each platform reads only one.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={[{ width: size, height: size }, styles.frame, style]}
    >
      <Glyph size={size} color={color} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Glyphs
// ---------------------------------------------------------------------------

/** A blood drop: a circle with one squared corner, tilted so the point faces up. */
function Drop({ size, color }) {
  const d = size * 0.82;
  return (
    <View
      style={{
        width: d,
        height: d,
        backgroundColor: color,
        borderRadius: d / 2,
        borderTopLeftRadius: d * 0.08,
        transform: [{ rotate: '-45deg' }],
      }}
    />
  );
}

/** A house: a diamond roof overlapping a body, both the same colour, so they fuse. */
function Home({ size, color }) {
  const roof = size * 0.62;
  const bodyW = size * 0.58;
  const bodyH = size * 0.42;

  return (
    <View style={styles.fill}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.06,
          width: roof,
          height: roof,
          backgroundColor: color,
          borderRadius: size * 0.1,
          transform: [{ rotate: '45deg' }],
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.12,
          width: bodyW,
          height: bodyH,
          backgroundColor: color,
          borderBottomLeftRadius: size * 0.08,
          borderBottomRightRadius: size * 0.08,
        }}
      />
    </View>
  );
}

/** A magnifier: a ring, plus a bar on the diagonal. */
function Search({ size, color }) {
  const ring = size * 0.6;
  const stroke = Math.max(2, size * 0.11);

  return (
    <View style={styles.fill}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.08,
          left: size * 0.08,
          width: ring,
          height: ring,
          borderRadius: ring / 2,
          borderWidth: stroke,
          borderColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          right: size * 0.1,
          bottom: size * 0.12,
          width: stroke,
          height: size * 0.3,
          backgroundColor: color,
          borderRadius: stroke,
          transform: [{ rotate: '-45deg' }],
        }}
      />
    </View>
  );
}

/** A bell: a dome over a squared base, with the clapper below it. */
function Bell({ size, color }) {
  const w = size * 0.62;
  const h = size * 0.58;

  return (
    <View style={styles.fill}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.12,
          width: w,
          height: h,
          backgroundColor: color,
          borderTopLeftRadius: w / 2,
          borderTopRightRadius: w / 2,
          borderBottomLeftRadius: size * 0.06,
          borderBottomRightRadius: size * 0.06,
        }}
      />
      {/* The flange under the dome, a touch wider than it. */}
      <View
        style={{
          position: 'absolute',
          top: size * 0.68,
          width: size * 0.8,
          height: size * 0.09,
          backgroundColor: color,
          borderRadius: size * 0.045,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.79,
          width: size * 0.2,
          height: size * 0.14,
          backgroundColor: color,
          borderBottomLeftRadius: size * 0.1,
          borderBottomRightRadius: size * 0.1,
        }}
      />
    </View>
  );
}

/** A person: head over shoulders. */
function User({ size, color }) {
  const head = size * 0.34;

  return (
    <View style={styles.fill}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.12,
          width: head,
          height: head,
          borderRadius: head / 2,
          backgroundColor: color,
        }}
      />
      <View
        style={{
          position: 'absolute',
          bottom: size * 0.12,
          width: size * 0.66,
          height: size * 0.34,
          backgroundColor: color,
          borderTopLeftRadius: size * 0.33,
          borderTopRightRadius: size * 0.33,
          borderBottomLeftRadius: size * 0.06,
          borderBottomRightRadius: size * 0.06,
        }}
      />
    </View>
  );
}

/** A medical cross. */
function Plus({ size, color }) {
  const arm = size * 0.66;
  const thickness = size * 0.22;

  return (
    <View style={styles.fill}>
      <View
        style={{
          position: 'absolute',
          width: arm,
          height: thickness,
          backgroundColor: color,
          borderRadius: thickness / 2,
        }}
      />
      <View
        style={{
          position: 'absolute',
          width: thickness,
          height: arm,
          backgroundColor: color,
          borderRadius: thickness / 2,
        }}
      />
    </View>
  );
}

/** A chevron. Two adjacent borders of a square, rotated to point. */
function Chevron({ size, color, rotation = '45deg' }) {
  const box = size * 0.42;
  const stroke = Math.max(2, size * 0.1);

  return (
    <View
      style={{
        width: box,
        height: box,
        borderTopWidth: stroke,
        borderRightWidth: stroke,
        borderColor: color,
        transform: [{ rotate: rotation }],
      }}
    />
  );
}

const ChevronRight = (props) => <Chevron {...props} rotation="45deg" />;
const ChevronDown = (props) => <Chevron {...props} rotation="135deg" />;

/** A tick. The other two borders of the same square, rotated the other way. */
function Check({ size, color }) {
  const box = size * 0.46;
  const stroke = Math.max(2, size * 0.11);

  return (
    <View
      style={{
        width: box * 0.66,
        height: box,
        borderBottomWidth: stroke,
        borderRightWidth: stroke,
        borderColor: color,
        // Nudged up so the rotated shape sits optically centred rather than mathematically.
        transform: [{ rotate: '45deg' }, { translateY: -size * 0.04 }],
      }}
    />
  );
}

/** Sliders — the settings glyph. Two tracks, each with a handle at a different position. */
function Sliders({ size, color }) {
  const track = size * 0.72;
  const thickness = Math.max(2, size * 0.09);
  const knob = size * 0.24;

  const row = (top, knobLeft) => (
    <View style={{ position: 'absolute', top, width: track, height: knob, justifyContent: 'center' }}>
      <View style={{ width: track, height: thickness, borderRadius: thickness, backgroundColor: color }} />
      <View
        style={{
          position: 'absolute',
          left: knobLeft,
          width: knob,
          height: knob,
          borderRadius: knob / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );

  return (
    <View style={styles.fill}>
      {row(size * 0.2, track * 0.58)}
      {row(size * 0.54, track * 0.06)}
    </View>
  );
}

/** A shield: a rounded top over a point, for the privacy screen. */
function Shield({ size, color }) {
  const w = size * 0.68;

  return (
    <View style={styles.fill}>
      <View
        style={{
          position: 'absolute',
          top: size * 0.1,
          width: w,
          height: size * 0.5,
          backgroundColor: color,
          borderTopLeftRadius: size * 0.12,
          borderTopRightRadius: size * 0.12,
        }}
      />
      <View
        style={{
          position: 'absolute',
          top: size * 0.44,
          width: w * 0.78,
          height: w * 0.78,
          backgroundColor: color,
          borderBottomRightRadius: size * 0.12,
          transform: [{ rotate: '45deg' }],
        }}
      />
    </View>
  );
}

/** A handset, tilted the way a phone icon always is. */
function Phone({ size, color }) {
  const w = size * 0.3;
  const h = size * 0.72;

  return (
    <View
      style={{
        width: w,
        height: h,
        borderRadius: size * 0.12,
        borderWidth: Math.max(2, size * 0.1),
        borderColor: color,
        transform: [{ rotate: '32deg' }],
      }}
    />
  );
}

/** Three stacked bars — a list or a worklist. */
function List({ size, color }) {
  const thickness = Math.max(2, size * 0.11);

  return (
    <View style={[styles.fill, { justifyContent: 'space-evenly', paddingVertical: size * 0.18 }]}>
      {[0.86, 0.68, 0.86].map((width, index) => (
        <View
          key={index}
          style={{
            width: size * width,
            height: thickness,
            borderRadius: thickness,
            backgroundColor: color,
          }}
        />
      ))}
    </View>
  );
}

const GLYPHS = {
  drop: Drop,
  home: Home,
  search: Search,
  bell: Bell,
  user: User,
  plus: Plus,
  chevron: ChevronRight,
  chevronDown: ChevronDown,
  check: Check,
  sliders: Sliders,
  shield: Shield,
  phone: Phone,
  list: List,
};

/** The names `Icon` will accept. Exported so a caller can be checked against it in review. */
export const ICON_NAMES = Object.keys(GLYPHS);

const styles = StyleSheet.create({
  /** The Icon root, which is given an explicit width and height by the caller. */
  frame: { alignItems: 'center', justifyContent: 'center' },
  /**
   * The root of a composed glyph. It must stretch rather than shrink to fit: every shape
   * inside one is `position: absolute`, so a shrink-to-fit parent measures zero and the
   * glyph never appears.
   */
  fill: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
});

export default Icon;
