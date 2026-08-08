import { useEffect, useRef, useState } from 'react';
import { StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AppButton,
  AppSelect,
  AppText,
  AppTextInput,
  Card,
  LiveMessage,
  LocationCapture,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { BLOOD_GROUP_OPTIONS } from '../../data/bloodGroups';
import { OTHER_CITY, STATES, citiesOf, districtsOf } from '../../data/locations';
import { createRequest, URGENCY_OPTIONS } from '../../services/requests';
import { getMe } from '../../services/profile';
import { hapticError, hapticSuccess } from '../../services/feedback';
import { normalizePhone } from '../../utils/phone';
import { fieldErrorsFrom, reportErrors, required, validate } from '../../utils/form';
import { colors, spacing } from '../../theme';

/**
 * Posting a blood request.
 *
 * This is the screen that makes other people's phones buzz. The backend runs the matching
 * engine inline and answers with how many donors were found and told, so pressing Post
 * gives a real answer — "12 nearby donors are being notified" — rather than a hopeful
 * "submitted" and a wait.
 *
 * ## Written for someone standing in a hospital corridor
 *
 * Every field is either something they can answer from where they are standing or has a
 * sensible default. Urgency defaults to Normal, the request stays open for 24 hours unless
 * told otherwise, and the contact number is prefilled from the verified phone. The location
 * is optional in the sense that a district is enough — matching falls back to
 * administrative area when there are no coordinates — but the screen asks for GPS first,
 * because distance is what decides who gets woken up.
 *
 * ## Errors
 *
 * Validation order is screen order, and on failure the first problem is announced by name
 * and the reader is moved to that field (`utils/form.js`). Announcing "3 errors" and leaving
 * a blind user to find them is the failure this whole mechanism exists to prevent.
 */
export default function PostRequestScreen() {
  const router = useRouter();
  const say = useAnnounce();

  const [values, setValues] = useState({
    bloodGroup: null,
    unitsNeeded: '1',
    hospitalName: '',
    contactPhone: '',
    urgency: 'NORMAL',
    note: '',
    state: 'Odisha',
    district: null,
    city: null,
    otherCity: '',
    expiryHours: 24,
  });
  const [coords, setCoords] = useState(null);
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null); // { message, tone }
  const [submitting, setSubmitting] = useState(false);

  const refs = {
    bloodGroup: useRef(null),
    unitsNeeded: useRef(null),
    hospitalName: useRef(null),
    contactPhone: useRef(null),
    urgency: useRef(null),
    district: useRef(null),
    city: useRef(null),
    otherCity: useRef(null),
    note: useRef(null),
  };

  // Prefill the contact number from the verified phone. It stays editable: the person
  // posting is often a relative, and the number to ring may be the one at the bedside.
  useEffect(() => {
    let active = true;
    getMe()
      .then((me) => {
        if (!active) return;
        setValues((current) => ({
          ...current,
          contactPhone: current.contactPhone || me.user?.phone || '',
          district: current.district ?? me.donorProfile?.district ?? null,
          city: current.city ?? me.donorProfile?.city ?? null,
        }));
      })
      .catch(() => {
        // Prefilling is a convenience. A failure here leaves an empty field the user can
        // type into, which is not worth an error banner on a form they are mid-way through.
      });
    return () => {
      active = false;
    };
  }, []);

  const districts = districtsOf(values.state);
  const cities = citiesOf(values.state, values.district);
  const cityIsOther = values.city === OTHER_CITY;

  function set(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: null }));
  }

  const FIELD_LABELS = {
    bloodGroup: 'Blood group needed',
    unitsNeeded: 'Units needed',
    hospitalName: 'Hospital name',
    contactPhone: 'Contact number',
    urgency: 'How urgent',
    district: 'District',
    city: 'City or town',
    otherCity: 'City or town name',
    note: 'Note',
  };

  async function submit() {
    if (submitting) return;

    const phone = normalizePhone(values.contactPhone);

    const { errors: found, order } = validate([
      ['bloodGroup', () => (values.bloodGroup ? null : 'Choose the blood group needed.')],
      ['unitsNeeded', () => checkUnits(values.unitsNeeded)],
      ['hospitalName', () => required(values.hospitalName, 'Enter the hospital name.')],
      ['contactPhone', () => (phone.ok ? null : phone.error)],
      ['urgency', () => (values.urgency ? null : 'Choose how urgent this is.')],
      // Either coordinates or a district: without one of them the matching engine has
      // nothing to work with and the request would sit there matching nobody, which looks
      // like a bug to someone in a hospital.
      [
        'district',
        () => (coords || values.district ? null : 'Choose a district, or share your location.'),
      ],
      ['otherCity', () => (cityIsOther ? required(values.otherCity, 'Enter the city or town.') : null)],
    ]);

    if (Object.keys(found).length) {
      setErrors(found);
      hapticError();
      reportErrors({ errors: found, order, refs, say, fieldLabels: FIELD_LABELS });
      return;
    }

    setSubmitting(true);
    setStatus({ message: 'Posting your request and finding donors nearby…', tone: 'progress' });

    try {
      const result = await createRequest({
        bloodGroup: values.bloodGroup,
        unitsNeeded: Number(values.unitsNeeded),
        hospitalName: values.hospitalName.trim(),
        contactPhone: phone.phone,
        urgency: values.urgency,
        note: values.note.trim(),
        state: values.state,
        district: values.district,
        city: cityIsOther ? values.otherCity.trim() : values.city,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
        expiresAt: new Date(Date.now() + values.expiryHours * 3_600_000).toISOString(),
      });

      hapticSuccess();
      // Announced here as well as on the destination screen: the navigation happens
      // immediately, and the count of donors being notified is the answer the person was
      // waiting for. The destination re-reads it into its own live region.
      say(result.message);

      router.replace({
        pathname: '/requests/[id]',
        params: { id: result.request.id, notice: result.message },
      });
    } catch (error) {
      hapticError();
      setStatus(null);

      const fieldErrors = fieldErrorsFrom(error, Object.keys(FIELD_LABELS));
      if (Object.keys(fieldErrors).length) {
        setErrors(fieldErrors);
        reportErrors({
          errors: fieldErrors,
          order: Object.keys(FIELD_LABELS),
          refs,
          say,
          fieldLabels: FIELD_LABELS,
        });
      } else {
        setStatus({ message: error.message, tone: 'error' });
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen
      footer={
        <AppButton
          title="Post request"
          size="large"
          loading={submitting}
          loadingLabel="Posting your request"
          onPress={submit}
          accessibilityHint="Posts the request and alerts matching donors near this location"
        />
      }
    >
      <ScreenHeader
        title="Request blood"
        subtitle="We will alert matching donors near the hospital straight away."
        voicePurpose="Tell us what blood is needed and where. Matching donors nearby are alerted straight away."
        voiceAction="Post request"
      />

      <LiveMessage message={status?.message} tone={status?.tone ?? 'info'} />

      <Card title="What is needed">
        <AppSelect
          ref={refs.bloodGroup}
          label="Blood group needed"
          required
          options={BLOOD_GROUP_OPTIONS}
          value={values.bloodGroup}
          onChange={(value) => set('bloodGroup', value)}
          error={errors.bloodGroup}
          helperText="We also alert donors whose group can safely donate to this one."
        />

        <AppTextInput
          ref={refs.unitsNeeded}
          label="Units needed"
          required
          value={values.unitsNeeded}
          onChangeText={(text) => set('unitsNeeded', text.replace(/\D/g, '').slice(0, 2))}
          error={errors.unitsNeeded}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={2}
          helperText="One unit is about 450 millilitres."
        />

        <AppSelect
          ref={refs.urgency}
          label="How urgent"
          required
          options={URGENCY_OPTIONS}
          value={values.urgency}
          onChange={(value) => set('urgency', value)}
          error={errors.urgency}
          helperText="Urgent and Critical requests are sent as high priority alerts."
        />
      </Card>

      <Card title="Where to come">
        <AppTextInput
          ref={refs.hospitalName}
          label="Hospital name"
          required
          value={values.hospitalName}
          onChangeText={(text) => set('hospitalName', text)}
          error={errors.hospitalName}
          autoCapitalize="words"
          helperText="Donors hear this in the alert, so include the ward if it helps."
        />

        <AppTextInput
          ref={refs.contactPhone}
          label="Contact number"
          required
          value={values.contactPhone}
          onChangeText={(text) => set('contactPhone', text)}
          error={errors.contactPhone}
          keyboardType="phone-pad"
          inputMode="tel"
          autoComplete="tel"
          helperText="The number a donor should call. Only shown to donors who accept, and to our staff."
        />

        <AppSelect
          label="State"
          options={STATES}
          value={values.state}
          onChange={(value) =>
            setValues((current) => ({ ...current, state: value, district: null, city: null }))
          }
        />

        <AppSelect
          ref={refs.district}
          label="District"
          options={districts}
          value={values.district}
          onChange={(value) => setValues((current) => ({ ...current, district: value, city: null }))}
          error={errors.district}
          disabled={!values.state}
        />

        <AppSelect
          ref={refs.city}
          label="City or town"
          options={cities}
          value={values.city}
          onChange={(value) => set('city', value)}
          error={errors.city}
          disabled={!values.district}
          helperText="Choose Other if the town is not listed."
        />

        {cityIsOther ? (
          <AppTextInput
            ref={refs.otherCity}
            label="City or town name"
            required
            value={values.otherCity}
            onChangeText={(text) => set('otherCity', text)}
            error={errors.otherCity}
            autoCapitalize="words"
          />
        ) : null}

        <AppText variant="caption" color={colors.textMuted} style={styles.hint}>
          Sharing the hospital's location lets us alert the closest donors first and tell each
          of them how far away they are. Without it we alert everyone in the district.
        </AppText>

        <LocationCapture value={coords} onChange={setCoords} disabled={submitting} />
      </Card>

      <Card title="Anything else">
        <AppTextInput
          ref={refs.note}
          label="Note for donors"
          value={values.note}
          onChangeText={(text) => set('note', text)}
          error={errors.note}
          multiline
          numberOfLines={3}
          maxLength={1000}
          helperText="Optional. For example, the patient's ward or who to ask for."
        />

        <AppSelect
          label="Keep this request open for"
          options={EXPIRY_OPTIONS}
          value={values.expiryHours}
          onChange={(value) => set('expiryHours', value)}
          helperText="After this, the request closes on its own and stops alerting donors."
        />
      </Card>
    </Screen>
  );
}

/** Matches `REQUEST_MAX_UNITS` on the backend — 20. */
function checkUnits(value) {
  const units = Number(String(value ?? '').trim());
  if (!String(value ?? '').trim()) return 'Enter how many units are needed.';
  if (!Number.isInteger(units) || units < 1) return 'Enter at least one unit.';
  if (units > 20) return 'Enter 20 units or fewer.';
  return null;
}

const EXPIRY_OPTIONS = [
  { value: 6, label: '6 hours' },
  { value: 12, label: '12 hours' },
  { value: 24, label: '24 hours', description: 'Usual choice' },
  { value: 48, label: '2 days' },
];

const styles = StyleSheet.create({
  hint: { marginTop: spacing.sm, marginBottom: spacing.md },
});
