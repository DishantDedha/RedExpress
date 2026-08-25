import { Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Icon } from './Icon';
import { colors, a11y } from '../theme';

/**
 * A back arrow for a screen that has no real navigation history to pop.
 *
 * `find-donors` and `notifications` are bottom tabs, not pushed screens — a tile on Home
 * reaches them with `router.push`, which switches the active tab rather than stacking a new
 * screen, so there is nothing for the native header's automatic back button to go back *to*.
 * This always sends the user to Home explicitly instead, which is the one place both tabs are
 * reachable from.
 *
 * Styled to match `brandHeaderOptions`: a plain white chevron floating over the red band, sized
 * to the platform's minimum touch target regardless of how small the glyph inside it looks.
 */
export function HeaderBackButton({ href = '/home', label = 'Back to Home' }) {
  const router = useRouter();

  return (
    <Pressable
      onPress={() => router.push(href)}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.button}
    >
      <Icon name="chevron" size={20} color={colors.onPrimary} style={styles.glyph} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: a11y.minTouchTarget,
    height: a11y.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The icon set only draws a right-pointing chevron; flipping it is cheaper than a new glyph.
  glyph: { transform: [{ rotate: '180deg' }] },
});

export default HeaderBackButton;
