import { Stack } from 'expo-router';
import { brandHeaderOptions } from '../../components';

/**
 * The sign-in and registration stack.
 *
 * A route group — the `(auth)` folder name adds no URL segment, so these are `/login`,
 * `/register`, `/phone`, `/otp` and so on. The grouping exists so the whole flow can be
 * given shared options without changing any path.
 *
 * The flow mirrors the mockups:
 *
 *     Landing ──▶ Phone (login) ─────▶ OTP ──▶ Home, or the form if the profile is unfinished
 *             └─▶ Register ──▶ type ─▶ Phone ──▶ OTP ──▶ Donor form
 *                              │                          (mockups 6 and 11)
 *                              └───────────────────────▶ Find blood form
 *                                                         (mockup 7)
 *
 * Phone and OTP are one pair of screens shared by both paths rather than two near-identical
 * copies: they take `role` and `mode` parameters and behave accordingly. The OTP screen is
 * the most delicate accessibility surface in the app, and it only has to be got right once.
 *
 * ## Why the header is configured here and not at the root
 *
 * This group is a Stack inside the root Stack. If both showed a header, every screen would
 * render two of them — and, worse for a screen-reader user, two back buttons one after the
 * other with nothing to distinguish them. The root defers (`headerShown: false` for this
 * group) and the header is styled here, white on red, to match the full-bleed brand screens
 * the whole flow uses.
 */
export default function AuthLayout() {
  return <Stack screenOptions={brandHeaderOptions} />;
}
