import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppButton,
  AppSelect,
  AppText,
  AppTextInput,
  Card,
  InitiativeFooter,
  LiveMessage,
  LocationCapture,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { OTHER_CITY, STATES, citiesOf, districtsOf } from '../../data/locations';
import { getStoredUser } from '../../services/auth';
import { registerReceiver } from '../../services/profile';
import { hapticSuccess } from '../../services/feedback';
import { formatPhoneForDisplay } from '../../utils/phone';
import { checkEmail, fieldErrorsFrom, reportErrors, required, validate } from '../../utils/form';
import { colors, spacing } from '../../theme';

/**
 * "Find Blood" quick registration — mockup 7.
 *
 * Deliberately short, and the shortness is the design. Someone filling this in is standing in
 * a hospital corridor, often at night, frequently on someone else's behalf. It asks for the
 * minimum the matching engine needs — a name, a district, and a position if they will share
 * one — and nothing else. No blood group here: that belongs to the *request*, not the person,
 * because the patient's group is what matters and the person filling the form may not know it
 * yet.
 *
 * Same accessibility contract as the donor form: validation in screen order, the first
 * problem announced by name, focus moved to it. The difference is that there is much less to
 * get wrong, which is the point.
 */
export default function ReceiverFormScreen() {
  const router = useRouter();
  const say = useAnnounce();
  const params = useLocalSearchParams();

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    state: 'Odisha',
    district: null,
    city: null,
    otherCity: '',
  });
  const [coords, setCoords] = useState(null);
  const [phone, setPhone] = useState(params.phone ? String(params.phone) : '');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (phone) return;
    getStoredUser().then((user) => {
      if (user?.phone) setPhone(user.phone);
    });
  }, [phone]);

  const refs = {
    fullName: useRef(null),
    email: useRef(null),
    state: useRef(null),
    district: useRef(null),
    city: useRef(null),
    otherCity: useRef(null),
  };

  const districts = useMemo(() => districtsOf(values.state), [values.state]);
  const cities = useMemo(() => citiesOf(values.state, values.district), [values.state, values.district]);

  const FIELD_LABELS = {
    fullName: 'Full name',
    email: 'Email address',
    state: 'State',
    district: 'District',
    city: 'City or town',
    otherCity: 'City or town name',
  };

  function set(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: null }));
  }

  function setDistrict(district) {
    setValues((current) => ({ ...current, district, city: null, otherCity: '' }));
    setErrors((current) => ({ ...current, district: null, city: null }));
    say(`District set to ${district}. Now choose your city or town.`);
  }

  const cityIsOther = values.city === OTHER_CITY;
  const resolvedCity = cityIsOther ? values.otherCity.trim() : values.city;

  async function handleSubmit() {
    if (submitting) return;

    const { errors: found, order } = validate([
      ['fullName', () => required(values.fullName, 'Enter your full name.')],
      ['email', () => checkEmail(values.email, { optional: true })],
      ['state', () => required(values.state, 'Choose your state.')],
      ['district', () => required(values.district, 'Choose your district.')],
      // City is optional on this form — the backend routes a request by district, and one
      // fewer required field matters when the person filling it in is in a hurry.
      ['otherCity', () => (cityIsOther ? required(values.otherCity, 'Enter your city or town.') : null)],
    ]);

    if (Object.keys(found).length) {
      setErrors(found);
      setStatus(null);
      reportErrors({ errors: found, order, refs, say, fieldLabels: FIELD_LABELS });
      return;
    }

    setErrors({});
    setSubmitting(true);
    setStatus({ message: 'Setting up your account…', tone: 'progress' });

    try {
      const result = await registerReceiver({
        fullName: values.fullName.trim(),
        email: values.email.trim() || undefined,
        phone,
        state: values.state,
        district: values.district,
        city: resolvedCity || undefined,
        latitude: coords?.latitude,
        longitude: coords?.longitude,
      });

      hapticSuccess();
      setStatus(null);

      say(
        result.locationSource === 'device'
          ? 'Account created. You can now post a blood request, and we will find the donors closest to you.'
          : 'Account created. You can now post a blood request, and we will find donors in your district.',
      );

      router.replace('/home');
    } catch (error) {
      setSubmitting(false);
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
        return;
      }

      setStatus({ message: error.message, tone: 'error' });
    }
  }

  return (
    <Screen
      tone="brand"
      footer={
        <View>
          <AppButton
            title="Continue"
            variant="brand"
            size="large"
            loading={submitting}
            loadingLabel="Setting up your account"
            onPress={handleSubmit}
            accessibilityHint="Saves your details so you can post a blood request"
          />
          <InitiativeFooter />
        </View>
      }
    >
      <ScreenHeader
        title="Find Blood"
        subtitle="A few details so we can reach donors near you."
        tone="brand"
        voicePurpose="Four details so we can reach donors near you: your name, your state, your district and your mobile number."
        voiceAction="Continue"
      />

      <LiveMessage message={status?.message} tone={status?.tone ?? 'info'} onBrand />

      <Card title="Your details">
        <AppTextInput
          ref={refs.fullName}
          label="Full name"
          required
          value={values.fullName}
          onChangeText={(text) => set('fullName', text)}
          error={errors.fullName}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          helperText="The name donors and our team will see when you request blood."
        />

        <View
          accessible
          accessibilityLabel={`Mobile number, ${phone ? formatPhoneForDisplay(phone) : 'not set'}. Verified. This is how donors reach you.`}
          style={styles.readOnly}
        >
          <AppText variant="label">Mobile number</AppText>
          <AppText variant="body" style={styles.readOnlyValue}>
            {phone ? formatPhoneForDisplay(phone) : '—'}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            Verified. This is how donors and our team will reach you.
          </AppText>
        </View>

        <AppTextInput
          ref={refs.email}
          label="Email address"
          value={values.email}
          onChangeText={(text) => set('email', text)}
          error={errors.email}
          keyboardType="email-address"
          inputMode="email"
          autoComplete="email"
          textContentType="emailAddress"
          autoCapitalize="none"
          helperText="Optional."
        />
      </Card>

      <Card title="Where you need blood">
        <AppSelect
          ref={refs.state}
          label="State"
          required
          options={STATES}
          value={values.state}
          onChange={(value) =>
            setValues((current) => ({ ...current, state: value, district: null, city: null }))
          }
          error={errors.state}
          placeholder="Select your state"
        />

        <AppSelect
          ref={refs.district}
          label="District"
          required
          options={districts}
          value={values.district}
          onChange={setDistrict}
          error={errors.district}
          placeholder="Select your district"
          disabled={!values.state}
          helperText="We search for donors here first."
        />

        <AppSelect
          ref={refs.city}
          label="City or town"
          options={cities}
          value={values.city}
          onChange={(value) => set('city', value)}
          error={errors.city}
          placeholder="Select your city or town"
          disabled={!values.district}
          helperText={
            values.district ? 'Optional. Choose Other if your town is not listed.' : 'Choose a district first.'
          }
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

        <LocationCapture value={coords} onChange={setCoords} disabled={submitting} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  readOnly: { marginBottom: spacing.lg, gap: spacing.xs },
  readOnlyValue: { marginTop: spacing.xs },
});
