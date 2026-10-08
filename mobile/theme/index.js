/**
 * The single source of design truth for the Red Express app.
 *
 * Every value here is a token, not a suggestion — components import from this file and
 * never hard-code a colour, a spacing step or a font size. That is what makes the
 * accessibility work (high-contrast mode, big-text preference) a change to one file rather
 * than a sweep through every screen.
 *
 * ## The palette is GMP's
 *
 * The scale below is the GMP storefront app's own brand ramp, value for value: #E02826 with
 * its 50-900 tints, and the Tailwind neutral ramp beside it. Red Express and GMP are built by
 * the same team and now read as one family — same red, same greys, same radii, same bottom
 * bar, same two typefaces.
 *
 * Three tokens deliberately do *not* take GMP's value, and the reason is the same in all
 * three cases: GMP has no contrast gate and these would not survive one.
 *
 *   textMuted   GMP captions are neutral-500 (#737373), which is 4.74:1 on white but drops
 *               to 4.33:1 on the blush surfaces this app uses for whole sections. Red Express
 *               takes neutral-600 instead, which is comfortable on all three.
 *   border      An input outline must clear 3:1 (1.4.11). GMP outlines its fields in
 *               neutral-200, which is 1.3:1 — a field edge you cannot see.
 *   status      GMP's success green and warning amber are 3.3:1 and 3.6:1 as text. The
 *               measured darker pair below is kept.
 *
 * ## Contrast
 *
 * The palette is not eyeballed. Every foreground/background pair the UI actually renders is
 * checked against WCAG 2.1 by `npm run verify:contrast` (scripts/check-contrast.mjs), which
 * fails the build if a pair drops below its minimum:
 *
 *   - text and images of text          4.5:1  (AA, 1.4.3)
 *   - UI component and graphical parts 3:1    (AA, 1.4.11) — input borders, focus rings
 *
 * The ratio in the comment beside each colour is its measured value against the surface it
 * is used on. Change a hex here and re-run the script before committing.
 *
 * ## Font sizes
 *
 * These are unscaled base sizes. React Native multiplies them by the OS font-size setting
 * automatically, and nothing in this app passes `allowFontScaling={false}`, so a donor who
 * has turned text up to 200% gets 200%. Layouts therefore use minimum heights and wrapping
 * rather than fixed heights — see `a11y.minTouchTarget`.
 *
 * ## No imports, ever
 *
 * `scripts/check-contrast.mjs` loads this file through a `data:` URL, which cannot resolve
 * relative specifiers. Adding an import here breaks the contrast gate — which is also why
 * the typography below names its families as plain strings, and the modules that supply them
 * live in `theme/fonts.js`.
 */

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/**
 * The brand ramp, straight from GMP's constants/tokens.ts.
 *
 * 600 is the brand red and the one every button, accent and active state resolves through.
 * The 700-900 end is where the app's red *surfaces* live — the hero bands, the bottom bar —
 * because a surface has to carry text, and white on 600 is 4.67:1 where white on 700 is
 * 5.98:1 with room left over for a second, quieter line of copy on top of it.
 */
const brandRamp = {
  50: '#FEF2F2',
  100: '#FEE3E2',
  200: '#FDCBCB',
  300: '#FEBCBB',
  400: '#F59592',
  500: '#ED625E',
  600: '#E02826', //  4.67:1 on white — the brand red. Fills and accents.
  700: '#C31D1C', //  5.98:1 with white — the hero band's light end
  800: '#A01918', //  7.93:1 with white (AAA) — pressed states, a red label on blush
  900: '#7B1312', // 10.80:1 with white — the hero band's dark end
};

/** Tailwind's neutral ramp, as GMP uses it. */
const neutralRamp = {
  50: '#FAFAFA',
  100: '#F5F5F5',
  200: '#E5E5E5',
  300: '#D4D4D4',
  400: '#A3A3A3',
  500: '#737373',
  600: '#525252',
  700: '#404040',
  800: '#262626',
  900: '#171717',
};

const palette = {
  // --- Brand -------------------------------------------------------------
  red600: brandRamp[600],
  red700: brandRamp[700],
  red800: brandRamp[800],
  red900: brandRamp[900],
  redTint: brandRamp[50],

  /**
   * The gradient ramp, light stop to dark stop.
   *
   * Used for the hero band at the top of a screen, and for the full-bleed brand screens in
   * the sign-in flow. Every stop is constrained by the same rule: both white *and* the muted
   * pink have to clear 4.5:1 on all three, because a caption may land anywhere along the
   * ramp. The lightest stop is therefore the binding one, and it is why the band starts at
   * 700 rather than at the brand red itself — on #E02826 the only AA foreground is pure
   * white, and a band with no second voice has no hierarchy on it.
   */
  gradientLight: brandRamp[700], //  5.98:1 with white, 4.93:1 with onBrandMuted
  gradientDark: brandRamp[900], // 10.80:1 with white, 8.90:1 with onBrandMuted

  /**
   * The near-black red of the bottom bar, sampled off GMP's own bar art.
   *
   * GMP bakes this into a PNG; here it is drawn by `<Gradient/>` from these two stops, which
   * is the same picture without an asset to keep in sync with the palette.
   */
  barLight: '#860901', // 10.20:1 with white
  barDark: '#140100',

  /**
   * Supporting copy on a red surface. GMP's own 100 tint, which measures 4.93:1 on the band's
   * lightest stop — AA with margin rather than the four-hundredths kind.
   */
  onBrandMuted: brandRamp[100],

  // --- Neutrals ----------------------------------------------------------
  ink: neutralRamp[900], // 17.90:1 on white — body copy
  /**
   * Captions and helper text. GMP's neutral-600, not its neutral-500: see the note at the top
   * of the file. 7.82:1 on white and 7.15:1 on blush, so "muted" never means "unreadable".
   */
  inkMuted: neutralRamp[600],
  inkDisabled: '#757575', //  4.61:1 on white. Disabled text is still text; it is dimmed by
  //                          opacity on top of this, never below AA here.
  border: '#858585', //  3.69:1 on white, 3.37:1 on blush — input outline. GMP outlines its
  //                     fields in neutral-200 (1.3:1); 1.4.11 wants 3:1 on *every* surface a
  //                     field sits on, and this is the lightest grey that clears it on all of
  //                     them.
  borderMuted: neutralRamp[200], //  GMP's card edge, exactly. Decorative — never encloses an
  //                                 interactive control.
  borderDisabled: '#757575', //  4.61:1 on white
  surface: neutralRamp[50], //  the quiet fill under a grouped list row
  /**
   * The page behind a list of full-bleed white blocks.
   *
   * GMP's list screens are not cards floating on white — they are a neutral-100 page with
   * white blocks laid edge to edge and an 8px gutter of page showing between them. The gutter
   * *is* the separator, which is why it needs a page colour you can actually see against
   * white rather than the 50 used for an inset fill.
   */
  pageMuted: neutralRamp[100],
  card: '#FFFFFF', //  card and screen background both. GMP's screens are white, and its cards
  //                   are told apart by a neutral-200 edge rather than by a grey page behind
  //                   them — which is most of why that app reads as crisp and this one read as
  //                   muddy.
  white: '#FFFFFF',

  /**
   * The blush surfaces — GMP's 50 and 100 tints.
   *
   * A white app with red controls is correct, and completely flat. These are the "red" half
   * of a white-and-red scheme doing the work a saturated fill cannot: they tint a section
   * without becoming a background anyone has to read dark text off at low contrast.
   *
   * They come with one rule: a red label on blush is `primaryOnTint` (the 800), never
   * `primary`. The brand red on its own 50 tint is 4.27:1.
   */
  blush: brandRamp[50], //  ink 16.10:1, primaryOnTint 7.36:1
  blushStrong: brandRamp[100], //  the pressed / selected state of a blush surface
  blushLine: brandRamp[200], //  decorative hairline on blush, never around a control
};

export const colors = {
  ...palette,

  /** The 50-900 ramps, for the rare component that needs a step by name — the bottom bar's
   *  active disc, a badge tint. Screens use the semantic aliases below. */
  brandRamp,
  neutralRamp,

  // Semantic aliases. Screens use these; the raw palette names above are for the theme file
  // and the contrast script.
  primary: palette.red600,
  primaryPressed: palette.red700,
  primaryOnTint: palette.red800,
  primaryTint: palette.redTint,
  onPrimary: palette.white,

  /**
   * The brand surface: red, carrying white.
   *
   * A band at the top of a white screen rather than the whole screen — see `gradientBrand`.
   * Its foreground pair is `onPrimary` (white) for anything that matters and `onBrandMuted`
   * for supporting copy. Nothing from the light-surface set — `text`, `textMuted`, `border` —
   * may be used on it; they are all dark, and all fail.
   */
  brand: palette.gradientLight,
  brandPressed: palette.red800,
  brandDeep: palette.red900,
  onBrandMuted: palette.onBrandMuted,

  /**
   * The brand gradient, light stop to dark stop. Consumed by `<Gradient/>`, which fakes it
   * with stacked bands — the app has no native gradient dependency and is not gaining one
   * for the sake of decoration.
   */
  gradientBrand: [palette.gradientLight, palette.red800, palette.gradientDark],

  /** The bottom bar's slab. Near-black red, like GMP's. */
  gradientBar: [palette.barLight, palette.barDark],

  background: palette.card,
  text: palette.ink,
  textMuted: palette.inkMuted,
  textDisabled: palette.inkDisabled,

  focusRing: palette.red600, // 4.67:1 on white, 4.27:1 on blush — over the 3:1 floor on both

  /**
   * A translucent panel on the red band — the quick-action tiles in the home header.
   *
   * Translucent rather than a flat tint so it sits in the gradient instead of cutting a
   * rectangle out of it, which is how GMP's header tiles read. Its *contents* are white and
   * are measured against the band underneath, not against this: the panel lightens whatever
   * is behind it, so the stops already checked are the worst case.
   */
  brandPanel: 'rgba(255, 255, 255, 0.16)',
  brandPanelPressed: 'rgba(255, 255, 255, 0.28)',
  /** The hairline round a translucent panel, so it has an edge of its own on a flat band. */
  brandPanelLine: 'rgba(255, 255, 255, 0.24)',

  // Status. Each one is paired with an icon and a word in the UI, because colour alone is
  // not allowed to carry the meaning (WCAG 1.4.1) and does not reach a blind user at all.
  // These are *not* GMP's values — see the note at the top of the file.
  success: '#1B5E20', //  7.87:1 on white
  successTint: '#E6F4E7',
  error: '#B3261E', //  6.54:1 on white
  errorTint: '#FDECEA',
  warning: '#8A5300', //  6.33:1 on white
  warningTint: '#FDF3E0',
  info: '#0B5394', //  7.84:1 on white
  infoTint: '#E7F0FA',
};

/**
 * The high-contrast preference.
 *
 * Not a second theme — a set of substitutions applied on top of the one above, so there is
 * still exactly one palette to check and no chance of the two drifting apart.
 *
 * What it changes, and why each one:
 *
 *   muted text     `textMuted` is 7.82:1, which is comfortable and still hard work with
 *                  reduced contrast sensitivity or in direct sunlight. High contrast drops the
 *                  distinction entirely: helper text becomes body text at 17.90:1. The visual
 *                  hierarchy is carried by size and weight instead, which survives.
 *
 *   borders        A 3.69:1 input outline meets 1.4.11 and can still be genuinely hard to
 *                  find. It becomes near-black, and one pixel wider — the edge of a control
 *                  is the thing you must see to know the control is there.
 *
 *   fills          The primary red darkens from 4.67:1 to 7.93:1 (AAA) and primary buttons
 *                  gain an outline, so a button reads as a button and not as a coloured
 *                  rectangle.
 *
 *   gradients      Flatten to a single dark stop. A ramp is decoration, and decoration that
 *                  varies the luminance underneath a caption is the opposite of what this
 *                  preference is for — see `Gradient`.
 *
 * `AppText` applies the text substitutions centrally, which is why they are keyed by the
 * exact colour a component would otherwise have used.
 */
export const highContrast = {
  /** Text colours, swapped by `AppText`. Both surfaces are covered: the light one and the
   *  brand red, where substituting dark ink would be catastrophic. */
  text: {
    [palette.inkMuted]: palette.ink, //        7.82:1 → 17.90:1 on white
    [palette.onBrandMuted]: palette.white, //  4.93:1 →  7.93:1 on the flattened band
    // `inkDisabled` is deliberately *not* here. Boosting disabled text to full contrast would
    // erase the only visual difference between a control that can be used and one that
    // cannot — high contrast should not cost a sighted user a state signal.
  },
  /** Non-text colours, applied by the components that draw edges and fills. */
  border: palette.ink, //          17.90:1 on white — an unmissable outline
  borderMuted: palette.border, //   3.69:1 — dividers and card edges become real borders
  primary: palette.red800, //       7.93:1 on white (AAA) — button and chip fills
  /** The flat fill a gradient collapses to. The 800, so white sits at 7.93:1 across the whole
   *  band instead of 5.98:1 at its light end. */
  gradient: palette.red800,
  borderWidth: 2, //                resting width for a control outline (normally 1)
  focusWidth: 3, //                 width when focused or in error (normally 2)
};

// ---------------------------------------------------------------------------
// Spacing, radius, elevation
// ---------------------------------------------------------------------------

/** 4pt grid, the same steps GMP's Tailwind theme extends with. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

/**
 * Radii, GMP's scale.
 *
 * The app is noticeably tighter than it was: cards were 20 and are now 16, buttons were 10
 * and are now 8. That is the difference between "rounded rectangle" and the crisper geometry
 * GMP's catalogue cards have.
 */
export const radius = {
  sm: 4,
  md: 8,
  lg: 12,
  /** Cards, action tiles, image frames. GMP's rounded-xl. */
  xl: 16,
  /** The bottom bar's top corners, and the white sheet that tucks under a hero band. */
  xxl: 26,
  /** The deeper curve on the sign-in sheet, where the sheet is most of the screen. */
  sheet: 40,
  pill: 999,
};

/**
 * Elevation.
 *
 * Shadow is decorative and is treated as such: every surface that takes one also draws a
 * border, so the edge survives on Android with elevation off, under "remove animations", and
 * in high-contrast mode. A card whose only boundary is a shadow has no boundary at all for a
 * large share of the people using this app.
 *
 * Lighter than it was, to match GMP, whose cards are held by a neutral-200 line with the
 * shadow barely there behind it rather than by the shadow itself.
 */
export const elevation = {
  sm: {
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  md: {
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  lg: {
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  /** For a surface sitting on red, where a black shadow reads as mud. */
  brand: {
    shadowColor: '#4D000E',
    shadowOpacity: 0.26,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
};

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * The two families, named as strings.
 *
 * GMP's pair: Poppins for the whole interface, Playfair Display for the display sizes and the
 * uppercase section titles. Running on the platform system font is the single biggest reason
 * a screenshot of this app never looked like one of GMP's beside it.
 *
 * Every weight is its own family rather than a `fontWeight` on one. React Native cannot
 * synthesise a weight from a single-weight family the way a browser can: ask for
 * `fontWeight: '700'` on Poppins_400Regular and you get either the regular cut or, on
 * Android, a smeared synthetic bold. So the weight is in the name, and `fontWeight` is absent
 * from every variant below on purpose.
 *
 * `theme/fonts.js` holds the modules these names come from. It cannot live in this file,
 * which the contrast gate loads through a `data:` URL and which therefore may not import
 * anything.
 */
export const fonts = {
  display: 'PlayfairDisplay_700Bold',
  displayRegular: 'PlayfairDisplay_400Regular',
  body: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
};

/**
 * lineHeight is set rather than left to the platform, and `AppText` scales it alongside the
 * font size for the big-text preference, so growing text never collides with the line below.
 */
export const typography = {
  /** The landing wordmark. Playfair, like GMP's serif display type. */
  hero: { fontSize: 38, lineHeight: 46, fontFamily: fonts.display },
  display: { fontSize: 30, lineHeight: 38, fontFamily: fonts.display },
  title: { fontSize: 24, lineHeight: 32, fontFamily: fonts.bold },
  heading: { fontSize: 20, lineHeight: 28, fontFamily: fonts.semibold },
  /**
   * GMP's section title: Playfair at 18, uppercased by the component, with a hair of
   * tracking. 18 rather than 22 is measured off their Figma — at 22 the headings were louder
   * than the content under them.
   */
  sectionTitle: { fontSize: 18, lineHeight: 24, fontFamily: fonts.display, letterSpacing: 0.4 },
  subheading: { fontSize: 17, lineHeight: 24, fontFamily: fonts.semibold },
  body: { fontSize: 16, lineHeight: 24, fontFamily: fonts.body },
  bodyStrong: { fontSize: 16, lineHeight: 24, fontFamily: fonts.semibold },
  label: { fontSize: 15, lineHeight: 20, fontFamily: fonts.semibold },
  caption: { fontSize: 14, lineHeight: 20, fontFamily: fonts.body },
  /** The 12px line under a card title or beside a menu row. GMP's own caption size. */
  footnote: { fontSize: 12, lineHeight: 17, fontFamily: fonts.body },
  /** Small spaced capitals for a section eyebrow. Always paired with a sentence-case
   *  accessibility label — readers spell short all-caps strings out letter by letter. */
  overline: { fontSize: 12, lineHeight: 16, letterSpacing: 1.2, fontFamily: fonts.bold },
  button: { fontSize: 16, lineHeight: 22, fontFamily: fonts.semibold },
  /** The all-caps label inside a pill button, as on GMP's catalogue cards. */
  buttonSmall: { fontSize: 12, lineHeight: 16, letterSpacing: 0.8, fontFamily: fonts.bold },
  /** The number on a stat tile. Tabular figures are set by the component, not here. */
  metric: { fontSize: 28, lineHeight: 34, fontFamily: fonts.bold },
};

// ---------------------------------------------------------------------------
// Accessibility constants
// ---------------------------------------------------------------------------

export const a11y = {
  /**
   * 48dp, the larger of the two platform minimums (Android 48dp, iOS 44pt), applied
   * everywhere so there is one number to check rather than two. This is a *minimum height*
   * on every interactive component — controls grow past it when text scales up.
   */
  minTouchTarget: 48,

  /** Comfortable target for the primary action on a screen; used by AppButton size="large". */
  largeTouchTarget: 56,

  /**
   * How long to wait after a screen mounts before moving screen-reader focus to its heading.
   * TalkBack and VoiceOver both re-announce the whole screen during the navigation
   * transition; firing setAccessibilityFocus into that window gets swallowed. This delay
   * lands just after the transition settles.
   */
  focusDelayMs: 350,

  /**
   * Announcements queued back-to-back get dropped by TalkBack. LiveMessage spaces them by
   * this much.
   */
  announceDebounceMs: 150,

  /** Cap on how far a font can scale before layout is compromised. Deliberately high —
   *  this is a ceiling to prevent clipping, not a way to keep text small. */
  maxFontSizeMultiplier: 2,

  /**
   * The in-app "big text" preference, multiplied on top of the OS text-size setting rather
   * than replacing it.
   *
   * 1.3 rather than something larger for a specific reason: it stacks. A user who has already
   * turned the OS up to 200% and then turns this on is asking for 260%, and `AppText` caps the
   * OS component at `maxFontSizeMultiplier` but does not cap this one — the preference is an
   * explicit request, and honouring it is the whole point. Every layout in the app is built
   * from minimum heights and wrapping, so it grows rather than clips, but 1.3 is where that
   * stays comfortable in the worst case rather than merely survivable.
   */
  bigTextScale: 1.3,
};

export const theme = {
  colors,
  spacing,
  radius,
  elevation,
  typography,
  fonts,
  a11y,
  highContrast,
};

export default theme;
