import { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  AppButton,
  AppCheckbox,
  AppDateInput,
  AppSelect,
  AppText,
  AppTextInput,
  Card,
  DictationButton,
  InitiativeFooter,
  LiveMessage,
  LocationCapture,
  PhotoPicker,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { BLOOD_GROUP_OPTIONS, GENDER_OPTIONS } from '../../data/bloodGroups';
import { OTHER_CITY, STATES, citiesOf, districtsOf } from '../../data/locations';
import { getStoredUser } from '../../services/auth';
import { config } from '../../services/config';
import { registerDonor } from '../../services/profile';
import { hapticSuccess } from '../../services/feedback';
import { formatPhoneForDisplay } from '../../utils/phone';
import {
  MAX_DONOR_AGE,
  MIN_DONOR_AGE,
  checkDateOfBirth,
  checkEmail,
  checkPassword,
  checkPincode,
  fieldErrorsFrom,
  reportErrors,
  required,
  validate,
} from '../../utils/form';
import { colors, spacing } from '../../theme';

/**
 * "Register as a Donor" — mockups 6 and 11. The longest form in the app, and therefore the
 * one where accessibility is either designed in or absent.
 *
 * ## Layout
 *
 * Red screen, one white card per section — Personal Information, Location Information,
 * Security — as the mockups draw it. The section titles are real headings, so a screen-reader
 * user can jump between them with heading navigation instead of swiping through thirty
 * controls to reach the last one.
 *
 * ## Submission
 *
 * Validation runs in *screen order* (`utils/form.js`). On failure the first problem is
 * announced by name — "There are 3 problems. Blood group. Choose a blood group." — and focus
 * moves to that control after a beat, so its error has rendered into its accessible name and
 * is read on arrival. Counting errors without naming one tells a blind user that something is
 * wrong and nothing about where.
 *
 * Server-side field errors are attached to the same inputs on the way back, so a duplicate
 * email lands on the email field rather than in a banner at the top.
 *
 * ## Location
 *
 * GPS is offered with its rationale attached and is never required — see `LocationCapture`.
 * When it is declined the typed address is geocoded server-side, and the response's
 * `locationSource` tells us which actually happened, so the success message can say so
 * rather than guess.
 */
export default function DonorFormScreen() {
  const router = useRouter();
  const say = useAnnounce();
  const params = useLocalSearchParams();

  const [values, setValues] = useState({
    fullName: '',
    email: '',
    bloodGroup: null,
    gender: null,
    dateOfBirth: null,
    state: 'Odisha',
    district: null,
    city: null,
    otherCity: '',
    pincode: '',
    address: '',
    password: '',
    confirmPassword: '',
    terms: false,
  });
  const [photo, setPhoto] = useState(null);
  const [coords, setCoords] = useState(null);
  const [phone, setPhone] = useState(params.phone ? String(params.phone) : '');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState(null); // { message, tone }
  const [submitting, setSubmitting] = useState(false);

  // The phone came from the OTP session, so it is read-only here. Backfilled from the cached
  // user when the screen is reached without it in the params (a cold start, say).
  useEffect(() => {
    if (phone) return;
    getStoredUser().then((user) => {
      if (user?.phone) setPhone(user.phone);
    });
  }, [phone]);

  const refs = {
    fullName: useRef(null),
    email: useRef(null),
    bloodGroup: useRef(null),
    gender: useRef(null),
    dateOfBirth: useRef(null),
    state: useRef(null),
    district: useRef(null),
    city: useRef(null),
    otherCity: useRef(null),
    pincode: useRef(null),
    address: useRef(null),
    password: useRef(null),
    confirmPassword: useRef(null),
    terms: useRef(null),
  };

  const districts = useMemo(() => districtsOf(values.state), [values.state]);
  const cities = useMemo(
    () => citiesOf(values.state, values.district),
    [values.state, values.district],
  );

  function set(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    // Clearing on edit means the error the reader hears is always about what is there now,
    // not what was there when Submit was pressed.
    if (errors[field]) setErrors((current) => ({ ...current, [field]: null }));
  }

  /** District and city are dependent: changing a parent invalidates its children. */
  function setDistrict(district) {
    setValues((current) => ({ ...current, district, city: null, otherCity: '' }));
    setErrors((current) => ({ ...current, district: null, city: null }));
    // Said out loud because the city dropdown's contents have just changed underneath a user
    // who cannot see it repopulate.
    say(`District set to ${district}. Now choose your city or town.`);
  }

  const cityIsOther = values.city === OTHER_CITY;
  const resolvedCity = cityIsOther ? values.otherCity.trim() : values.city;

  const FIELD_LABELS = {
    fullName: 'Full name',
    email: 'Email address',
    bloodGroup: 'Blood group',
    gender: 'Gender',
    dateOfBirth: 'Date of birth',
    state: 'State',
    district: 'District',
    city: 'City or town',
    otherCity: 'City or town name',
    pincode: 'PIN code',
    address: 'Address',
    password: 'Password',
    confirmPassword: 'Confirm password',
    terms: 'Terms and conditions',
  };

  async function handleSubmit() {
    if (submitting) return;

    // Ordered exactly as the fields appear on screen — see utils/form.js for why that
    // matters more than it looks.
    const { errors: found, order } = validate([
      ['fullName', () => required(values.fullName, 'Enter your full name.')],
      ['email', () => checkEmail(values.email)],
      ['bloodGroup', () => (values.bloodGroup ? null : 'Choose a blood group.')],
      ['gender', () => (values.gender ? null : 'Choose a gender.')],
      ['dateOfBirth', () => checkDateOfBirth(values.dateOfBirth)],
      ['state', () => required(values.state, 'Choose your state.')],
      ['district', () => required(values.district, 'Choose your district.')],
      ['city', () => (values.city ? null : 'Choose your city or town.')],
      ['otherCity', () => (cityIsOther ? required(values.otherCity, 'Enter your city or town.') : null)],
      ['pincode', () => checkPincode(values.pincode)],
      ['address', () => required(values.address, 'Enter your address.')],
      ['password', () => checkPassword(values.password)],
      [
        'confirmPassword',
        () => {
          if (!values.password) return null;
          if (!values.confirmPassword) return 'Confirm your password.';
          return values.password === values.confirmPassword ? null : 'Passwords do not match.';
        },
      ],
      ['terms', () => (values.terms ? null : 'You must agree to the terms and conditions to register.')],
    ]);

    if (Object.keys(found).length) {
      setErrors(found);
      setStatus(null);
      reportErrors({ errors: found, order, refs, say, fieldLabels: FIELD_LABELS });
      return;
    }

    setErrors({});
    setSubmitting(true);
    setStatus({ message: 'Creating your donor account…', tone: 'progress' });

    try {
      const result = await registerDonor(
        {
          fullName: values.fullName.trim(),
          email: values.email.trim(),
          phone,
          bloodGroup: values.bloodGroup,
          gender: values.gender,
          dateOfBirth: values.dateOfBirth ?? undefined,
          state: values.state,
          district: values.district,
          city: resolvedCity,
          pincode: values.pincode.trim(),
          address: values.address.trim(),
          latitude: coords?.latitude,
          longitude: coords?.longitude,
          password: values.password || undefined,
          confirmPassword: values.password ? values.confirmPassword : undefined,
        },
        photo,
      );

      hapticSuccess();
      setStatus(null);

      // `locationSource` is the server telling us what it actually used, so the confirmation
      // is accurate rather than optimistic — and it is the only cue a blind user gets that
      // declining the GPS permission had a consequence.
      const locationNote =
        result.locationSource === 'device'
          ? 'We will use your exact location to find requests near you.'
          : result.locationSource === 'none'
            ? 'We could not pin your address on the map, so we will match you by district.'
            : 'We will use your address to find requests near you.';

      say(`Account created. You are registered as a blood donor. ${locationNote}`);
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

      // Nothing field-specific — a conflict, a network failure. Shown and spoken at the top.
      setStatus({ message: error.message, tone: 'error' });
    }
  }

  return (
    <Screen
      hero={
        <ScreenHeader
          title="Register as a Donor"
          subtitle="Register today to become a lifesaving blood donor for patients."
          tone="brand"
          voicePurpose="A form in three parts: your details, where you live, and a password if you want one. Only the marked fields are required."
          voiceAction="Create account"
        />
      }
      footer={
        <View>
          <AppButton
            title="Create Account"
            size="large"
            loading={submitting}
            loadingLabel="Creating your account"
            onPress={handleSubmit}
            accessibilityHint="Checks the form and creates your donor account"
          />
          <InitiativeFooter />
        </View>
      }
    >
      <LiveMessage message={status?.message} tone={status?.tone ?? 'info'} />

      {/* --- Personal Information ----------------------------------------- */}

      <Card title="Personal Information">
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
        />

        {/* Renders nothing unless dictation is available *and* switched on — see
            services/voiceInput.js. Typing is always available either way. */}
        <DictationButton
          fieldLabel="full name"
          onResult={(text) => set('fullName', text)}
          disabled={submitting}
        />

        <AppTextInput
          ref={refs.email}
          label="Email address"
          required
          value={values.email}
          onChangeText={(text) => set('email', text)}
          error={errors.email}
          keyboardType="email-address"
          inputMode="email"
          autoComplete="email"
          textContentType="emailAddress"
          autoCapitalize="none"
          helperText="We use this for donation receipts and account recovery."
        />

        {/* Read-only, because changing it would mean re-verifying it. Rendered as text
            rather than a disabled input: a disabled field is still a stop on the reader's
            path and announces "dimmed", which invites a user to wonder what they did wrong. */}
        <View
          accessible
          accessibilityLabel={`Mobile number, ${phone ? formatPhoneForDisplay(phone) : 'not set'}. Verified. This cannot be changed here.`}
          style={styles.readOnly}
        >
          <AppText variant="label">Mobile number</AppText>
          <AppText variant="body" style={styles.readOnlyValue}>
            {phone ? formatPhoneForDisplay(phone) : '—'}
          </AppText>
          <AppText variant="caption" color={colors.textMuted}>
            Verified. To use a different number, sign in with that number instead.
          </AppText>
        </View>

        <AppSelect
          ref={refs.bloodGroup}
          label="Blood group"
          required
          options={BLOOD_GROUP_OPTIONS}
          value={values.bloodGroup}
          onChange={(value) => set('bloodGroup', value)}
          error={errors.bloodGroup}
          placeholder="Select your blood group"
          helperText="Ask at your last donation if you are not sure."
        />

        <AppSelect
          ref={refs.gender}
          label="Gender"
          required
          options={GENDER_OPTIONS}
          value={values.gender}
          onChange={(value) => set('gender', value)}
          error={errors.gender}
          placeholder="Select your gender"
        />

        <AppDateInput
          ref={refs.dateOfBirth}
          label="Date of birth"
          value={values.dateOfBirth}
          onChange={(value) => set('dateOfBirth', value)}
          error={errors.dateOfBirth}
          helperText={`Optional. Donors must be between ${MIN_DONOR_AGE} and ${MAX_DONOR_AGE} years old.`}
        />

        <PhotoPicker value={photo} onChange={setPhoto} disabled={submitting} />
      </Card>

      {/* --- Location Information ------------------------------------------ */}

      <Card title="Location Information">
        <AppText variant="body" color={colors.textMuted} style={styles.sectionNote}>
          This is how we find patients near you. Nobody sees your street address — other users
          only ever see how far away you are.
        </AppText>

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
          helperText={values.state ? undefined : 'Choose a state first.'}
        />

        <AppSelect
          ref={refs.city}
          label="City or town"
          required
          options={cities}
          value={values.city}
          onChange={(value) => set('city', value)}
          error={errors.city}
          placeholder="Select your city or town"
          disabled={!values.district}
          helperText={
            values.district ? 'Choose Other if your town is not listed.' : 'Choose a district first.'
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

        <AppTextInput
          ref={refs.pincode}
          label="PIN code"
          required
          value={values.pincode}
          onChangeText={(text) => set('pincode', text.replace(/\D/g, '').slice(0, 6))}
          error={errors.pincode}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={6}
          autoComplete="postal-code"
          textContentType="postalCode"
        />

        <AppTextInput
          ref={refs.address}
          label="Address"
          required
          value={values.address}
          onChangeText={(text) => set('address', text)}
          error={errors.address}
          multiline
          numberOfLines={3}
          autoComplete="street-address"
          helperText="House or flat, street, and landmark."
        />

        {/* The field dictation is most worth having on: a full address typed one
            screen-reader-announced character at a time is the slowest thing in this app. */}
        <DictationButton
          fieldLabel="address"
          onResult={(text) => set('address', text)}
          disabled={submitting}
        />

        <LocationCapture value={coords} onChange={setCoords} disabled={submitting} />
      </Card>

      {/* --- Security ------------------------------------------------------- */}

      <Card title="Security">
        <AppText variant="body" color={colors.textMuted} style={styles.sectionNote}>
          Optional. You sign in with a one time password sent to your mobile, so a password is
          only useful if you would rather not wait for a text.
        </AppText>

        <AppTextInput
          ref={refs.password}
          label="Password"
          value={values.password}
          onChangeText={(text) => set('password', text)}
          error={errors.password}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          autoCapitalize="none"
          helperText="At least 8 characters. Leave blank to sign in by one time password only."
        />

        <AppTextInput
          ref={refs.confirmPassword}
          label="Confirm password"
          value={values.confirmPassword}
          onChangeText={(text) => set('confirmPassword', text)}
          error={errors.confirmPassword}
          secureTextEntry
          autoComplete="new-password"
          textContentType="newPassword"
          autoCapitalize="none"
        />

        <AppCheckbox
          ref={refs.terms}
          label="I agree to the terms and conditions and the privacy policy"
          checked={values.terms}
          onChange={(checked) => set('terms', checked)}
          error={errors.terms}
          helperText="Your details are used to match you with patients who need your blood group."
        />

        {/* Consent to something you cannot read is not consent. These sit under the box
            rather than inside its label so the checkbox stays one clean tap target with one
            spoken state, and reading a document is a separate, obvious action. */}
        <View style={styles.policyLinks}>
          <PolicyLink
            title="Read the privacy policy"
            url={config.privacyPolicyUrl}
            label="privacy policy"
            say={say}
          />
          <PolicyLink
            title="Read the terms and conditions"
            url={config.termsUrl}
            label="terms and conditions"
            say={say}
          />
        </View>
      </Card>

      <View style={styles.existing}>
        <AppText variant="body" color={colors.textMuted}>
          Already have an account?
        </AppText>
        <AppButton
          title="Login here"
          variant="link"
          size="small"
          fullWidth={false}
          onPress={() => router.replace({ pathname: '/phone', params: { mode: 'login' } })}
          accessibilityHint="Leaves this form and signs you in with your mobile number"
        />
      </View>
    </Screen>
  );
}

/**
 * A link to one of the consent documents.
 *
 * Renders as a real button with a role and a hint rather than underlined text inside a
 * sentence — inline links are a known screen-reader trap on React Native, where they are read
 * as part of the surrounding paragraph and are not reachable as their own stop.
 *
 * When the URL is missing from the build it still renders, and says so on press. A silently
 * dead button is worse than an honest one: a blind user has no way to tell the difference
 * between "nothing happened" and "I missed the target".
 */
function PolicyLink({ title, url, label, say }) {
  return (
    <AppButton
      title={title}
      variant="link"
      onPress={() => {
        if (!url) {
          say(`The ${label} is not available in this build. Email ${config.supportEmail} for a copy.`);
          return;
        }
        say(`Opening the ${label} in your browser.`);
        Linking.openURL(url).catch(() =>
          say(`Could not open the ${label}. Email ${config.supportEmail} for a copy.`),
        );
      }}
      accessibilityHint={`Opens the ${label} in your browser. You can come back to this form afterwards.`}
    />
  );
}

const styles = StyleSheet.create({
  policyLinks: { marginTop: spacing.md, gap: spacing.xs },
  readOnly: { marginBottom: spacing.lg, gap: spacing.xs },
  readOnlyValue: { marginTop: spacing.xs },
  sectionNote: { marginBottom: spacing.lg },
  existing: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
