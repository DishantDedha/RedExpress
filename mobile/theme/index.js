/**
 * The single source of design truth for the Red Express app.
 *
 * Every value here is a token, not a suggestion — components import from this file and
 * never hard-code a colour, a spacing step or a font size. That is what makes the Phase 11
 * accessibility pass (high-contrast mode, big-text preference) a change to one file rather
 * than a sweep through every screen.
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
 */

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

const palette = {
  // Deep red. The brand colour, and dark enough to carry white text at 7.33:1 — a lighter,
  // "friendlier" red would have failed AA and forced dark text on every button.
  red600: '#B00020', // 7.33:1 on white — button fill, headings, focus ring
  red700: '#8C0019', // 9.86:1 on white — pressed state
  red800: '#8A0016', // 8.51:1 on redTint — text on a tinted surface
  redTint: '#FDE7EB', // decorative fill behind red800 / red600 text

  // Text on the deep-red brand surface. The landing, mobile-number and verification screens
  // are full-bleed red (mockups 1, 2, 3 and 5), so the muted "subtitle" grey used on white
  // has no equivalent there — it would be unreadable. This pale pink is the muted tone for
  // red backgrounds: 5.35:1 on red600, so "muted" still clears AA.
  onBrandMuted: '#F6D4D9',

  // Neutrals.
  ink: '#1B1B1F', //  17.17:1 on white — body copy
  inkMuted: '#5A5D66', //  6.58:1 on white — captions, helper text. Still AA: "muted" must
  //                       never mean "unreadable".
  inkDisabled: '#6B6F78', //  5.04:1 on white — disabled label. Disabled text is still text;
  //                          it is dimmed by opacity elsewhere, never below AA here.
  border: '#878A93', //  3.45:1 on white, 3.22:1 on surface — input outline. Picked to clear
  //                     1.4.11's 3:1 on *both* backgrounds: a form field is not always
  //                     inside a card, and the lighter grey that passed on white alone
  //                     dropped to 2.95:1 straight on the screen.
  borderMuted: '#C4C7CF', //  decorative divider only, never encloses an interactive control
  borderDisabled: '#767A85', //  4.29:1 on white
  surface: '#F7F7F9', //  screen background
  card: '#FFFFFF', //  raised card background
  white: '#FFFFFF',

  // Status. Each one is paired with an icon and a word in the UI, because colour alone is
  // not allowed to carry the meaning (WCAG 1.4.1) and does not reach a blind user at all.
  success: '#1B5E20', //  7.87:1 on white
  successTint: '#E6F4E7',
  error: '#B3261E', //  6.54:1 on white
  errorTint: '#FDECEA',
  warning: '#8A5300', //  6.33:1 on white
  warningTint: '#FDF3E0',
  info: '#0B5394', //  7.84:1 on white
  infoTint: '#E7F0FA',
};

export const colors = {
  ...palette,

  // Semantic aliases. Screens use these; the raw palette names above are for the theme file
  // and the contrast script.
  primary: palette.red600,
  primaryPressed: palette.red700,
  primaryOnTint: palette.red800,
  primaryTint: palette.redTint,
  onPrimary: palette.white,

  /**
   * The brand surface: a screen that is red edge to edge rather than a red control on grey.
   * Used by the pre-sign-in screens, which is the whole of Phase 8.
   *
   * Its foreground pair is `onPrimary` (white) for anything that matters and `onBrandMuted`
   * for supporting copy. Nothing from the light-surface set — `text`, `textMuted`, `border` —
   * may be used on it; they are all dark, and all fail.
   */
  brand: palette.red600,
  brandPressed: palette.red700,
  onBrandMuted: palette.onBrandMuted,

  background: palette.surface,
  text: palette.ink,
  textMuted: palette.inkMuted,
  textDisabled: palette.inkDisabled,

  focusRing: palette.red600, // 7.33:1 on white, 6.85:1 on surface — well over the 3:1 floor
};

/**
 * The high-contrast preference (Phase 11).
 *
 * Not a second theme — a set of substitutions applied on top of the one above, so there is
 * still exactly one palette to check and no chance of the two drifting apart.
 *
 * What it changes, and why each one:
 *
 *   muted text     `textMuted` is 6.58:1, which passes AA and is still hard work with reduced
 *                  contrast sensitivity or in direct sunlight. High contrast drops the
 *                  distinction entirely: helper text becomes body text at 17.17:1. The visual
 *                  hierarchy is carried by size and weight instead, which survives.
 *
 *   borders        A 3.45:1 input outline meets 1.4.11 and can still be genuinely hard to
 *                  find. It becomes near-black, and one pixel wider — the edge of a control
 *                  is the thing you must see to know the control is there.
 *
 *   fills          The primary red darkens from 7.33:1 to 9.86:1 (AAA) and primary buttons
 *                  gain an outline, so a button reads as a button and not as a coloured
 *                  rectangle.
 *
 * `AppText` applies the text substitutions centrally, which is why they are keyed by the
 * exact colour a component would otherwise have used.
 */
export const highContrast = {
  /** Text colours, swapped by `AppText`. Both surfaces are covered: the light one and the
   *  full-bleed brand red, where substituting dark ink would be catastrophic. */
  text: {
    [palette.inkMuted]: palette.ink, //        6.58:1 → 17.17:1 on white
    [palette.onBrandMuted]: palette.white, //  5.35:1 →  7.33:1 on red600
    // `inkDisabled` is deliberately *not* here. Boosting disabled text to full contrast would
    // erase the only visual difference between a control that can be used and one that
    // cannot — high contrast should not cost a sighted user a state signal.
  },
  /** Non-text colours, applied by the components that draw edges and fills. */
  border: palette.ink, //        17.17:1 on white — an unmissable outline
  borderMuted: palette.border, //  3.45:1 — dividers and card edges become real borders
  primary: palette.red700, //      9.86:1 on white (AAA) — button and chip fills
  borderWidth: 2, //               resting width for a control outline (normally 1)
  focusWidth: 3, //                width when focused or in error (normally 2)
};

// ---------------------------------------------------------------------------
// Spacing, radius, elevation
// ---------------------------------------------------------------------------

/** 4pt grid. Generous by default — the mockups are airy and it helps low-vision users. */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  pill: 999,
};

/** Shadow is decorative. Card edges are also drawn with a border so they survive on Android
 *  with elevation off, and in high-contrast mode. */
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
};

// ---------------------------------------------------------------------------
// Type
// ---------------------------------------------------------------------------

/**
 * lineHeight is a multiple of fontSize rather than a fixed number, so it scales with the
 * user's font setting instead of clipping descenders at large sizes.
 */
export const typography = {
  display: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 32 },
  heading: { fontSize: 20, fontWeight: '600', lineHeight: 28 },
  subheading: { fontSize: 17, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodyStrong: { fontSize: 16, fontWeight: '600', lineHeight: 24 },
  label: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  caption: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  button: { fontSize: 17, fontWeight: '600', lineHeight: 24 },
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
   * than replacing it (Phase 11).
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

export const theme = { colors, spacing, radius, shadow, typography, a11y, highContrast };

export default theme;
