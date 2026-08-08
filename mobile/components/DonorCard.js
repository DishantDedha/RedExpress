import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { Card } from './Card';
import { bloodGroupLabel } from '../data/bloodGroups';
import { distancePhrase } from '../services/requests';
import { callNumber } from '../utils/call';
import { formatPhoneForDisplay, formatPhoneForSpeech } from '../utils/phone';
import { colors, spacing } from '../theme';

/**
 * One donor in a list of results.
 *
 * ## Two stops, not six
 *
 * A result card holds a name, a blood group, a place, a distance, an availability state and
 * a Call button. Left as plain views, a screen-reader user swipes through six nodes per
 * donor and has to hold the association in their head — in a list of twenty results they
 * lose track of which distance belonged to which name long before they reach the end.
 *
 * So the facts are collapsed into a single focus stop that reads as one sentence:
 *
 *     "Ravi Kumar. O positive. About 3 kilometres away. In Cuttack. Available to donate."
 *
 * and the Call button is a second stop beside it. Two swipes per donor, and the second one
 * is the action.
 *
 * The grouping deliberately does *not* use `Card grouped`: `accessible` on a wrapper makes
 * the entire subtree one element, which would swallow the Call button along with the text.
 * The summary view is the grouped part; the button is its sibling.
 *
 * ## What is not on the card
 *
 * No street address, no coordinates. The backend does not send them to an app user
 * (`donorSearchView`) — a distance is enough to decide who to ring, and publishing where
 * someone lives to anyone who can type a blood group is a different product. Phase 15
 * revisits the rest of the PII rules.
 */
export function DonorCard({ donor, onCall }) {
  const group = bloodGroupLabel(donor.bloodGroup);
  const distance = distancePhrase(donor.distanceKm);
  const place = [donor.city, donor.district].filter(Boolean).join(', ');
  const name = donor.name || 'Donor';

  // Spoken as sentences. Full stops are the only punctuation that reliably gives a listener
  // a beat, and without them the reader runs the name into the blood group.
  const summary = [
    `${name}.`,
    `${group}.`,
    distance ? `${capitalise(distance)}.` : null,
    place ? `In ${place}.` : null,
    donor.isAvailable ? 'Available to donate.' : 'Not available right now.',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <Card style={styles.card}>
      <View accessible accessibilityLabel={summary} style={styles.summary}>
        <AppText variant="subheading">{name}</AppText>

        <View style={styles.facts}>
          {/*
            The blood group is the reason this card is on screen, so it is drawn as a chip.
            The chip carries the words "O positive", never a bare "O+" — read aloud, "plus"
            and "minus" are a one-syllable difference on a field where being wrong is a
            medical error.
          */}
          <AppText variant="bodyStrong" color={colors.primaryOnTint} style={styles.chip}>
            {group}
          </AppText>

          {distance ? (
            <AppText variant="caption" color={colors.textMuted}>
              {capitalise(distance)}
            </AppText>
          ) : null}
        </View>

        {place ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.line}>
            {place}
          </AppText>
        ) : null}

        {/* Availability is a word, not a green dot. The colour is a supplement. */}
        <AppText
          variant="caption"
          color={donor.isAvailable ? colors.success : colors.textMuted}
          style={styles.line}
        >
          {donor.isAvailable ? 'Available to donate' : 'Not available right now'}
        </AppText>

        {donor.phone ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.line}>
            {formatPhoneForDisplay(donor.phone)}
          </AppText>
        ) : null}
      </View>

      {donor.phone ? (
        <AppButton
          title={`Call ${name}`}
          variant="secondary"
          onPress={() => {
            onCall?.(donor);
            callNumber(donor.phone, { name });
          }}
          // The number is read digit by digit. Handed a bare phone number a screen reader
          // says "seven billion, eight million…", which tells the user nothing about who
          // they are about to ring.
          accessibilityLabel={`Call ${name}, ${formatPhoneForSpeech(donor.phone)}`}
          accessibilityHint="Opens your phone's dialler with this number"
        />
      ) : (
        <AppText variant="caption" color={colors.textMuted}>
          No phone number on record. Our team can still reach this donor.
        </AppText>
      )}
    </Card>
  );
}

const capitalise = (text) => text.charAt(0).toUpperCase() + text.slice(1);

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  summary: { marginBottom: spacing.md },
  facts: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  chip: {
    backgroundColor: colors.primaryTint,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    borderRadius: 999,
    overflow: 'hidden',
  },
  line: { marginTop: spacing.xs },
});

export default DonorCard;
