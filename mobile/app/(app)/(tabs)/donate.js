import { Image, StyleSheet, View } from 'react-native';
import { AppText, Card, Screen, ScreenHeader } from '../../../components';
import { colors, spacing } from '../../../theme';

/**
 * Donate — a UPI QR code, and nothing else.
 *
 * There is no in-app payment flow: the code is scanned by whatever UPI app the donor already
 * has, and the transaction happens entirely outside this app. That is also why there is no
 * accessible alternative to the image itself — a screen reader user cannot scan a QR code
 * either way, and this screen does not pretend otherwise.
 */
export default function DonateScreen() {
  return (
    <Screen
      bar={
        <ScreenHeader
          layout="bar"
          title="Donate"
          voicePurpose="Scan the QR code shown here with any UPI app to make a contribution."
        />
      }
    >
      <Card>
        <View style={styles.frame}>
          <Image
            source={require('../../../assets/donate-qr.jpeg')}
            style={styles.qr}
            resizeMode="contain"
            accessible
            accessibilityLabel="QR code for donating to Red Express via UPI"
          />
        </View>

        <AppText variant="body" color={colors.textMuted} style={styles.hint}>
          Open any UPI app — Google Pay, PhonePe, Paytm, or your bank's app — and scan this code
          to send a contribution directly.
        </AppText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { alignItems: 'center', paddingVertical: spacing.md },
  qr: { width: 240, height: 240 },
  hint: { marginTop: spacing.md, textAlign: 'center' },
});
