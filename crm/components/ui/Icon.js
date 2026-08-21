/**
 * The dashboard's icon set: inline SVG, no dependency, no icon font.
 *
 * ## Why not the characters that were here before
 *
 * The sidebar used `▤`, `☰` and `✚`, and the badges still use `●`, `▲`, `■`. Those are text.
 * A screen reader will try to pronounce them — "black square", "up-pointing triangle", or in
 * some voices nothing at all — which is why every one of them had to be wrapped in
 * `aria-hidden`. They also depend on the system font having the glyph, and fall back to a
 * tofu box when it does not.
 *
 * These are `<svg>` with `aria-hidden="true"` and `focusable="false"` set once, here, so
 * there is no per-call-site rule to forget. `focusable="false"` matters on its own: without
 * it, Internet Explorer's descendant behaviour survives into some enterprise browser
 * configurations and puts every decorative icon in the tab order.
 *
 * ## They are decorative, always
 *
 * Every icon in this dashboard sits beside its own label — a nav item's name, a tile's
 * caption, a badge's word. None of them is the sole carrier of anything, which is what makes
 * hiding them unconditionally the correct default rather than a shortcut. An icon that needed
 * its own label would be a fact stated only in a picture, and this app does not have one.
 *
 * `currentColor` throughout, so an icon takes the colour of the text it sits with and cannot
 * drift out of contrast independently of it.
 */

const PATHS = {
  /** Dashboard — four panes. */
  grid: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  /** People. */
  people: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0z" />
      <circle cx="17.5" cy="9.5" r="2.75" />
      <path d="M14 20a5.5 5.5 0 0 1 7.5-5.13V20z" />
    </>
  ),
  /** A blood drop — blood requests. */
  drop: <path d="M12 2.5c3.9 4.2 6.5 7.4 6.5 10.6a6.5 6.5 0 0 1-13 0C5.5 9.9 8.1 6.7 12 2.5z" />,
  /** A medical cross. */
  cross: <path d="M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z" />,
  /** An open blood request awaiting a calling list. */
  clock: (
    <>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 6.75a1 1 0 0 1 1 1V12h3a1 1 0 1 1 0 2h-4a1 1 0 0 1-1-1V7.75a1 1 0 0 1 1-1z" />
    </>
  ),
  /** A handset — calls logged. */
  phone: (
    <path d="M6.6 3h3l1.5 4-2 1.4a12 12 0 0 0 5.5 5.5l1.4-2 4 1.5v3a2 2 0 0 1-2.2 2A16.5 16.5 0 0 1 4.6 5.2 2 2 0 0 1 6.6 3z" />
  ),
  /** A tick. */
  check: <path d="M9.6 16.2 5.4 12l-1.4 1.4 5.6 5.6L20.4 7.8 19 6.4z" />,
  /** A warning triangle. */
  alert: (
    <path d="M12 2.8 22.4 20.8H1.6zm-1 6.2v5.4h2V9zm0 7v2h2v-2z" />
  ),
};

export const ICON_NAMES = Object.keys(PATHS);

export default function Icon({ name, className = 'h-5 w-5' }) {
  const path = PATHS[name];
  if (!path) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      // Decorative, always — see the header. `focusable` keeps it out of the tab order in
      // browsers that still honour the old SVG default.
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
    >
      {path}
    </svg>
  );
}

/**
 * The Red Express mark: a blood drop with a medical cross in it.
 *
 * Drawn rather than shipped as a PNG, for the same reason the app draws its own
 * (`mobile/components/BrandMark.js`) — it stays crisp for a staff member running display
 * zoom, which a raster logo does not.
 *
 * Decorative. The wordmark beside it is the text, so the drawing announcing "image" first
 * would be one stop of noise before the app's name.
 */
export function BrandMark({ className = 'h-8 w-8', cross = 'var(--color-brand-deep)' }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={`shrink-0 ${className}`}>
      <path
        d="M12 2.5c3.9 4.2 6.5 7.4 6.5 10.6a6.5 6.5 0 0 1-13 0C5.5 9.9 8.1 6.7 12 2.5z"
        fill="currentColor"
      />
      {/*
        The cross is a cutout, so it has to be painted in whatever sits *behind* the drop —
        which is why it is a prop rather than a fixed colour. A white drop on the rail needs a
        deep-red cross; a red drop on a white card needs a white one. Get it wrong and the
        cross is red-on-red and the mark reads as a plain blob.
      */}
      <path d="M11 9.5h2v2.2h2.2v2H13V16h-2v-2.3H8.8v-2H11z" fill={cross} />
    </svg>
  );
}
