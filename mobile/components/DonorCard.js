import { StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { AppButton } from './AppButton';
import { Avatar } from './Avatar';
import { Card } from './Card';
import { Chip } from './Chip';
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
 * ## The layout, and why the chips are hidden
 *
 * The card leads with the two things a caller is scanning for — who, and what group — set as
 * an avatar, a name and a chip on one line, with the distance and place beneath. Every one of
 * those is *also* in the summary label above, which is the element a screen reader actually
 * stops on. So the chips themselves are hidden: reachable, they would repeat "O positive" and
 * "Available" as bare words with nothing to say what they are properties of.
 *
 * The avatar is decorative too and hides itself (see `Avatar`) — initials read aloud in front
 * of the name they are initials of are noise.
 *
 * ## Calling is the primary action
 *
 * The Call button is filled rather than outlined. On a screen whose entire purpose is to put
 * someone on the phone during an emergency, the one control that does it should not be drawn
 * as the quiet option.
 *
 * ## What is not on the card
 *
 * No street address, no coordinates. The backend does not send them to an app user
 * (`donorSearchView`) — a distance is enough to decide who to ring, and publishing where
 * someone lives to anyone who can type a blood group is a different product.
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
        <View style={styles.identity}>
          <Avatar name={donor.name} size={44} />

          <View style={styles.identityText}>
            <AppText variant="subheading">{name}</AppText>

            {distance ? (
              <AppText variant="caption" color={colors.textMuted} style={styles.line}>
                {capitalise(distance)}
                {place ? ` · ${place}` : ''}
              </AppText>
            ) : place ? (
              <AppText variant="caption" color={colors.textMuted} style={styles.line}>
                {place}
              </AppText>
            ) : null}
          </View>
        </View>

        {/*
          Decoration for facts the summary above has already spoken. The blood group chip
          carries the words "O positive", never a bare "O+" — read aloud, "plus" and "minus"
          are a one-syllable difference on a field where being wrong is a medical error, which
          is why this app never renders the symbol at all.
        */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={styles.chips}
        >
          <Chip label={group} tone="tint" />
          <Chip
            label={donor.isAvailable ? 'Available' : 'Not available'}
            tone={donor.isAvailable ? 'success' : 'neutral'}
            icon={donor.isAvailable ? 'check' : undefined}
          />
        </View>

        {donor.phone ? (
          <AppText variant="caption" color={colors.textMuted} style={styles.phone}>
            {formatPhoneForDisplay(donor.phone)}
          </AppText>
        ) : null}
      </View>

      {donor.phone ? (
        <AppButton
          title={`Call ${name}`}
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
  summary: { marginBottom: spacing.lg },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  // Takes the remaining width so a long name wraps under itself rather than pushing the
  // avatar off the card.
  identityText: { flexShrink: 1, flexGrow: 1 },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  line: { marginTop: 2 },
  phone: { marginTop: spacing.md },
});

export default DonorCard;
