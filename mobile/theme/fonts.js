import {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';
import {
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
} from '@expo-google-fonts/poppins';
import { useFonts } from 'expo-font';

/**
 * The app's two typefaces, loaded.
 *
 * GMP's pair, and for GMP's reason: Poppins carries the interface, Playfair Display carries
 * the display sizes and the uppercase section titles. Before this the app ran on whatever the
 * platform's system font happened to be — San Francisco on one phone, Roboto on the next —
 * which is why a screenshot of it never looked like the design beside it.
 *
 * ## Why six families and not two
 *
 * React Native cannot synthesise a weight from a single-weight family. `fontWeight: '700'` on
 * Poppins_400Regular gets you the regular cut on iOS and, on Android, a smeared synthetic
 * bold that is noticeably worse than the real 700. So every weight the design uses is loaded
 * as its own family and named in `theme/index.js`'s `fonts` map, and no variant in
 * `typography` sets `fontWeight` at all.
 *
 * ## Why this is a separate file from the rest of the theme
 *
 * `scripts/check-contrast.mjs` reads `theme/index.js` through a `data:` URL so it can check
 * the real tokens rather than a copy of them, and a `data:` URL cannot resolve a relative
 * import. The theme file therefore names its families as plain strings, and the modules those
 * strings refer to live here.
 */
export const appFonts = {
  PlayfairDisplay_400Regular,
  PlayfairDisplay_700Bold,
  Poppins_400Regular,
  Poppins_500Medium,
  Poppins_600SemiBold,
  Poppins_700Bold,
};

/**
 * `[loaded, error]`, as `useFonts` returns it.
 *
 * The root layout holds the splash screen until this is settled. Rendering before the fonts
 * arrive is not a blank screen — it is the whole app drawn in the system font and then
 * reflowing, which at these sizes moves every line of every screen.
 *
 * An `error` is not treated as fatal by the caller. A font that fails to download leaves the
 * app in the system font, which is the state it shipped in for months; refusing to start
 * would be a worse outcome than looking wrong.
 */
export function useAppFonts() {
  return useFonts(appFonts);
}

export default appFonts;
