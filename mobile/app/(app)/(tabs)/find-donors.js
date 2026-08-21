import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  AppButton,
  AppSelect,
  AppSwitch,
  AppText,
  Card,
  DonorCard,
  LiveMessage,
  LocationCapture,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../../components';
import { BLOOD_GROUP_OPTIONS, bloodGroupLabel } from '../../../data/bloodGroups';
import { STATES, citiesOf, districtsOf } from '../../../data/locations';
import { useFocusMover } from '../../../hooks/useAccessibilityFocus';
import { searchDonors } from '../../../services/donors';
import { hapticError, hapticSuccess } from '../../../services/feedback';
import { colors, spacing } from '../../../theme';

/**
 * Find Blood Donors (mockup 2).
 *
 * The mockup is four dropdowns and a Search button. Two things are added, both because the
 * backend already supports them and neither is discoverable otherwise:
 *
 *   proximity — with a position and a radius the search switches from "everyone in
 *               Cuttack district" to "everyone within 10 km, nearest first", and every
 *               result carries a distance. That is the difference between a directory and
 *               a tool you can use in an emergency.
 *
 *   compatibility — someone who needs A positive can also receive from O positive, O
 *               negative and A negative. A receiver typing their own group into a filter
 *               that matches it exactly is shown a quarter of the people who could actually
 *               help them.
 *
 * ## What happens after Search, for someone who cannot see the list
 *
 * A results list appearing below a button is a silent change: nothing the user is focused on
 * moved, so a screen reader says nothing at all. Three things happen instead — the count is
 * announced as a sentence ("3 donors found."), the reader is moved to the results heading,
 * and the heading itself carries the count. Then each donor is two swipes: a summary and a
 * Call button (`components/DonorCard.js`).
 */
export default function FindDonorsScreen() {
  const say = useAnnounce();
  const moveFocus = useFocusMover();
  const resultsHeadingRef = useRef(null);

  const [filters, setFilters] = useState({
    bloodGroup: null,
    state: 'Odisha',
    district: null,
    city: null,
    compatible: false,
    availableOnly: true,
  });
  const [coords, setCoords] = useState(null);
  const [radiusKm, setRadiusKm] = useState(25);

  const [results, setResults] = useState(null); // null = no search run yet
  const [meta, setMeta] = useState(null);
  const [status, setStatus] = useState(null); // { message, tone }
  const [searching, setSearching] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const districts = districtsOf(filters.state);
  const cities = citiesOf(filters.state, filters.district);

  function set(field, value) {
    setFilters((current) => ({ ...current, [field]: value }));
  }

  async function run({ page = 1 } = {}) {
    if (searching || loadingMore) return;

    // A search with no blood group and no area is "every donor in the database", which is a
    // slow query and a useless answer. Guarded here rather than server-side because the
    // backend legitimately allows it for the CRM.
    if (!filters.bloodGroup && !filters.district && !coords) {
      setError('Choose a blood group, a district, or share your location before searching.');
      hapticError();
      say('There is a problem. Choose a blood group, a district, or share your location before searching.');
      return;
    }

    setError(null);
    if (page === 1) {
      setSearching(true);
      setStatus({ message: 'Searching for donors…', tone: 'progress' });
    } else {
      setLoadingMore(true);
      say('Loading more donors.');
    }

    try {
      const result = await searchDonors({
        bloodGroup: filters.bloodGroup ?? undefined,
        compatible: filters.compatible,
        state: filters.state ?? undefined,
        district: filters.district ?? undefined,
        city: filters.city ?? undefined,
        availableOnly: filters.availableOnly,
        coords: coords ?? undefined,
        radiusKm: coords ? radiusKm : undefined,
        page,
      });

      setMeta(result);
      // Appending rather than replacing on page 2 keeps the reader's place: replacing the
      // list would drop the cursor back to the top and the user would re-read the first ten.
      setResults((current) => (page === 1 ? result.results : [...(current ?? []), ...result.results]));
      setStatus(null);

      const truncatedNote = result.truncated
        ? ' This is a partial list. Try a smaller radius for a complete answer.'
        : '';

      if (page === 1) {
        if (result.total) hapticSuccess();
        // The server writes this sentence, so the spoken count and the visible one cannot
        // drift apart: "3 donors found." / "No donors found. Try a wider area…"
        say(`${result.message}${truncatedNote}`);
        moveFocus(resultsHeadingRef, 400);
      } else {
        say(`${result.results.length} more donors added. ${result.total} in total.`);
      }
    } catch (err) {
      hapticError();
      setStatus(null);
      setError(err.message);
      say(`Search failed. ${err.message}`);
    } finally {
      setSearching(false);
      setLoadingMore(false);
    }
  }

  const heading =
    results === null
      ? null
      : results.length === 0
        ? 'No donors found'
        : `${meta.total} ${meta.total === 1 ? 'donor' : 'donors'} found`;

  return (
    <Screen
      hero={
        <ScreenHeader
          title="Find blood donors"
          subtitle="Search verified donors near you for an emergency blood requirement."
          tone="brand"
          voicePurpose="Choose a blood group and an area, then search. Results are nearest first, each with a call button."
          voiceAction="Search"
        />
      }
      footer={
        <AppButton
          title="Search"
          size="large"
          loading={searching}
          loadingLabel="Searching for donors"
          onPress={() => run({ page: 1 })}
          accessibilityHint="Finds donors matching the filters above"
        />
      }
    >
      <Card title="Who you need">
        <AppSelect
          label="Blood group"
          options={BLOOD_GROUP_OPTIONS}
          value={filters.bloodGroup}
          onChange={(value) => set('bloodGroup', value)}
          placeholder="Any blood group"
          helperText="The group the patient needs."
        />

        <AppSwitch
          label="Include compatible groups"
          value={filters.compatible}
          onValueChange={(value) => set('compatible', value)}
          onText={
            filters.bloodGroup
              ? `Showing everyone who can donate to ${bloodGroupLabel(filters.bloodGroup)}.`
              : 'Choose a blood group to widen the search.'
          }
          offText="Showing only donors with exactly this blood group."
          accessibilityHint="Widens the search to every blood group that can safely donate to the one chosen above"
        />
      </Card>

      <Card title="Where">
        <AppSelect
          label="State"
          options={STATES}
          value={filters.state}
          onChange={(value) => setFilters((current) => ({ ...current, state: value, district: null, city: null }))}
        />

        <AppSelect
          label="District"
          options={districts}
          value={filters.district}
          onChange={(value) => setFilters((current) => ({ ...current, district: value, city: null }))}
          disabled={!filters.state}
          placeholder="Any district"
        />

        <AppSelect
          label="City or town"
          options={cities}
          value={filters.city}
          onChange={(value) => set('city', value)}
          disabled={!filters.district}
          placeholder="Any city or town"
        />
      </Card>

      <Card title="Search near you">
        <AppText variant="caption" color={colors.textMuted} style={styles.hint}>
          Share your location to sort donors by how far away they are. Without it we search by
          district, which still works.
        </AppText>

        <LocationCapture value={coords} onChange={setCoords} />

        {coords ? (
          <AppSelect
            label="Search within"
            options={RADIUS_OPTIONS}
            value={radiusKm}
            onChange={setRadiusKm}
            helperText="Donors further away than this are left out."
          />
        ) : null}

        <AppSwitch
          label="Only donors available now"
          value={filters.availableOnly}
          onValueChange={(value) => set('availableOnly', value)}
          onText="Hiding donors who have marked themselves unavailable."
          offText="Including donors who are not available right now."
          accessibilityHint="A donor who is unwell or has donated recently can switch themselves off"
        />
      </Card>

      <LiveMessage message={status?.message} tone={status?.tone ?? 'info'} />
      <LiveMessage message={error} tone="error" />

      {/* --- Results ------------------------------------------------------- */}

      {results !== null ? (
        <View style={styles.results}>
          <AppText ref={resultsHeadingRef} variant="heading" accessibilityRole="header" accessible>
            {heading}
          </AppText>

          {meta?.truncated ? (
            <AppText variant="caption" color={colors.warning} style={styles.note}>
              Note. This is a partial list. Search a smaller area for a complete answer.
            </AppText>
          ) : null}

          {results.length === 0 ? (
            <AppText variant="body" color={colors.textMuted} style={styles.note}>
              Nobody matched this search. Try a wider area, turn off "Only donors available
              now", or turn on "Include compatible groups". You can also post a blood request
              and we will alert donors near you.
            </AppText>
          ) : (
            results.map((donor) => <DonorCard key={donor.userId} donor={donor} />)
          )}

          {meta?.hasMore ? (
            <AppButton
              title="Show more donors"
              variant="secondary"
              loading={loadingMore}
              loadingLabel="Loading more donors"
              onPress={() => run({ page: meta.page + 1 })}
              accessibilityHint={`Adds the next page of results. ${results.length} of ${meta.total} shown so far`}
            />
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

/**
 * Radii people actually think in. Kept short on purpose: a slider would be finer-grained and
 * far worse to operate without sight, where every value has to be reached one increment at a
 * time and read back.
 */
const RADIUS_OPTIONS = [
  { value: 5, label: '5 kilometres', description: 'Same neighbourhood' },
  { value: 10, label: '10 kilometres', description: 'Across town' },
  { value: 25, label: '25 kilometres', description: 'City and nearby areas' },
  { value: 50, label: '50 kilometres' },
  { value: 100, label: '100 kilometres', description: 'Widest search' },
];

const styles = StyleSheet.create({
  hint: { marginBottom: spacing.md },
  results: { marginTop: spacing.xl },
  note: { marginTop: spacing.sm, marginBottom: spacing.lg },
});
