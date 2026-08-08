import { useCallback, useEffect, useRef, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import {
  AppButton,
  AppDateInput,
  AppSelect,
  AppSwitch,
  AppText,
  AppTextInput,
  Card,
  LiveMessage,
  LocationCapture,
  PhotoPicker,
  Screen,
  ScreenHeader,
  useAnnounce,
} from '../../components';
import { BLOOD_GROUP_OPTIONS, GENDER_OPTIONS, bloodGroupLabel, genderLabel } from '../../data/bloodGroups';
import { OTHER_CITY, STATES, citiesOf, districtsOf } from '../../data/locations';
import {
  getDonorProfile,
  setAvailability,
  setLastDonationDate,
  updateDonorProfile,
} from '../../services/profile';
import { hapticError, hapticSuccess } from '../../services/feedback';
import { formatPhoneForDisplay } from '../../utils/phone';
import {
  checkDateOfBirth,
  checkDonationDate,
  checkEmail,
  checkPincode,
  fieldErrorsFrom,
  reportErrors,
  required,
  validate,
} from '../../utils/form';
import { colors, spacing, radius } from '../../theme';

/**
 * The donor's own profile: read it, edit it, say whether you can donate right now, and record
 * your last donation.
 *
 * ## Read mode is a summary, not a disabled form
 *
 * A common shortcut is to render the edit form with every input disabled. That is a bad
 * screen to navigate: a reader stops on fourteen dimmed controls, announces "dimmed" fourteen
 * times, and the user has to work out that none of them do anything. So read mode is plain
 * labelled text, and the fields only exist once you press Edit.
 *
 * ## The two quick actions are separate from editing
 *
 * Availability and the last donation date have their own endpoints and their own buttons,
 * outside the edit form. They are the things a donor changes often — usually one-handed,
 * usually in a hurry — and making someone enter an edit mode, scroll past their address and
 * press Save to say "not right now" would be the wrong shape.
 *
 * Each saves immediately, reports `busy` while it does, and announces the *consequence* the
 * server sends back ("You are now shown as available to donate") rather than the boolean.
 * On failure the switch snaps back to what the server still believes, because a control that
 * shows a state the server does not have is worse than one that refused.
 */
export default function ProfileScreen() {
  const router = useRouter();
  const say = useAnnounce();

  const [profile, setProfile] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [status, setStatus] = useState(null); // { message, tone }

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [coords, setCoords] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [donationDate, setDonationDate] = useState(null);
  const [donationError, setDonationError] = useState(null);
  const [donationBusy, setDonationBusy] = useState(false);

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
  };

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const result = await getDonorProfile();
      setProfile(result.donorProfile);
      setUser(result.user);
      setDonationDate(toDateInput(result.donorProfile?.lastDonationDate));
    } catch (error) {
      // A receiver has no donor profile, and that is not a failure — it is a different
      // account type that ended up on the wrong screen.
      setLoadError(
        error.code === 'PROFILE_NOT_FOUND'
          ? 'You have not registered as a donor yet.'
          : error.message,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Announce the outcome of loading. Without this the screen simply stops being busy, which
  // is silent — a screen-reader user has no idea whether it worked.
  useEffect(() => {
    if (loading) return;
    if (loadError) say(`Could not load your profile. ${loadError}`);
  }, [loading, loadError, say]);

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
  };

  function beginEdit() {
    const cities = citiesOf(profile.state, profile.district).map((option) => option.value);
    const cityIsListed = cities.includes(profile.city);

    setValues({
      fullName: user?.name ?? '',
      email: user?.email ?? '',
      bloodGroup: profile.bloodGroup,
      gender: profile.gender,
      dateOfBirth: toDateInput(profile.dateOfBirth),
      state: profile.state,
      district: profile.district,
      // A city typed into "Other" at registration is not in the list, so edit mode has to
      // put it back into the free-text field rather than silently dropping it.
      city: cityIsListed ? profile.city : OTHER_CITY,
      otherCity: cityIsListed ? '' : (profile.city ?? ''),
      pincode: profile.pincode ?? '',
      address: profile.address ?? '',
    });
    setPhoto(null);
    setCoords(null);
    setErrors({});
    setStatus(null);
    setEditing(true);
    say('Editing your profile. Change what you need to and press Save changes.');
  }

  function cancelEdit() {
    setEditing(false);
    setValues(null);
    setErrors({});
    say('Editing cancelled. No changes were saved.');
  }

  function set(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: null }));
  }

  const cityIsOther = values?.city === OTHER_CITY;

  async function handleSave() {
    if (saving) return;

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
    ]);

    if (Object.keys(found).length) {
      setErrors(found);
      reportErrors({ errors: found, order, refs, say, fieldLabels: FIELD_LABELS });
      return;
    }

    setSaving(true);
    setStatus({ message: 'Saving your changes…', tone: 'progress' });

    try {
      const result = await updateDonorProfile(
        {
          fullName: values.fullName.trim(),
          email: values.email.trim(),
          bloodGroup: values.bloodGroup,
          gender: values.gender,
          dateOfBirth: values.dateOfBirth ?? undefined,
          state: values.state,
          district: values.district,
          city: cityIsOther ? values.otherCity.trim() : values.city,
          pincode: values.pincode.trim(),
          address: values.address.trim(),
          latitude: coords?.latitude,
          longitude: coords?.longitude,
        },
        photo,
      );

      setProfile(result.donorProfile);
      setUser(result.user);
      setEditing(false);
      setValues(null);
      setStatus(null);
      hapticSuccess();
      say('Profile updated.');
    } catch (error) {
      setStatus(null);
      hapticError();

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
      setSaving(false);
    }
  }

  async function toggleAvailability(next) {
    if (availabilityBusy) return;

    // Optimistic, so the switch responds to the tap immediately — but see the rollback below.
    const previous = profile.isAvailable;
    setProfile((current) => ({ ...current, isAvailable: next }));
    setAvailabilityBusy(true);

    try {
      const result = await setAvailability(next);
      setProfile(result.donorProfile);
      hapticSuccess();
      // The server's own sentence: "You are now shown as available to donate."
      say(result.message);
    } catch (error) {
      // Put the control back to what the server still believes. A switch showing a state
      // that was never saved is worse than one that visibly refused.
      setProfile((current) => ({ ...current, isAvailable: previous }));
      hapticError();
      say(`Could not change your availability. ${error.message}`);
      setStatus({ message: error.message, tone: 'error' });
    } finally {
      setAvailabilityBusy(false);
    }
  }

  async function saveDonationDate(date) {
    const problem = date ? checkDonationDate(date) : null;
    if (problem) {
      setDonationError(problem);
      return;
    }

    setDonationError(null);
    setDonationBusy(true);

    try {
      const result = await setLastDonationDate(date);
      setProfile(result.donorProfile);
      setDonationDate(toDateInput(result.donorProfile?.lastDonationDate));
      hapticSuccess();
      say(result.message);
    } catch (error) {
      hapticError();
      setDonationError(error.message);
    } finally {
      setDonationBusy(false);
    }
  }

  // --- Render ---------------------------------------------------------------

  if (loading) {
    return (
      <Screen>
        <ScreenHeader title="Your profile" subtitle="Loading your donor details." />
        <LiveMessage message="Loading your profile…" tone="progress" />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen>
        <ScreenHeader title="Your profile" />
        <LiveMessage message={loadError} tone="error" />
        <AppButton
          title="Try again"
          variant="secondary"
          onPress={load}
          style={styles.retry}
          accessibilityHint="Loads your profile again"
        />
        <AppButton
          title="Register as a donor"
          variant="link"
          onPress={() => router.push('/donor-form')}
          accessibilityHint="Opens the donor registration form"
        />
      </Screen>
    );
  }

  const eligibility = describeEligibility(profile.lastDonationDate);

  return (
    <Screen
      footer={
        editing ? (
          <View style={styles.footerRow}>
            <View style={styles.footerAction}>
              <AppButton
                title="Save changes"
                loading={saving}
                loadingLabel="Saving your changes"
                onPress={handleSave}
                accessibilityHint="Saves your profile"
              />
            </View>
            <View style={styles.footerAction}>
              <AppButton
                title="Cancel"
                variant="secondary"
                disabled={saving}
                onPress={cancelEdit}
                accessibilityHint="Discards your changes"
              />
            </View>
          </View>
        ) : null
      }
    >
      <ScreenHeader
        title="Your profile"
        subtitle={editing ? 'Change what you need to and save.' : 'Your donor details and availability.'}
        voicePurpose={
          editing
            ? 'Change your donor details, then save.'
            : 'Your donor details. You can switch your availability on or off, and record your last donation.'
        }
        voiceAction={editing ? 'Save changes' : 'Available to donate'}
      />

      <LiveMessage message={status?.message} tone={status?.tone ?? 'info'} />

      {/* --- Availability -------------------------------------------------- */}

      <Card title="Available to donate">
        <AppSwitch
          label="I can donate right now"
          value={profile.isAvailable}
          onValueChange={toggleAvailability}
          loading={availabilityBusy}
          onText="You are shown as available. Patients near you can find you."
          offText="You are shown as not available. You will not appear in searches or get alerts."
          accessibilityHint="Turning this off hides you from donor searches until you turn it back on"
        />

        <AppText variant="caption" color={colors.textMuted} style={styles.note}>
          Turn this off when you are unwell, travelling, or have donated recently. It takes
          effect immediately and you can turn it back on any time.
        </AppText>
      </Card>

      {/* --- Last donation ------------------------------------------------- */}

      <Card title="Last donation">
        <AppText variant="body" style={styles.eligibility}>
          {eligibility.summary}
        </AppText>

        <AppDateInput
          label="Date of your last donation"
          value={donationDate}
          onChange={(value) => {
            setDonationDate(value);
            if (donationError) setDonationError(null);
          }}
          error={donationError}
          formatHint="For example, 15 3 2024."
          helperText="Leave this blank if you have never donated."
          disabled={donationBusy}
        />

        <View style={styles.inlineActions}>
          <AppButton
            title="Save date"
            variant="secondary"
            size="small"
            fullWidth={false}
            loading={donationBusy}
            loadingLabel="Saving the date"
            onPress={() => saveDonationDate(donationDate)}
            accessibilityHint="Records when you last gave blood"
          />
          {profile.lastDonationDate ? (
            <AppButton
              title="Clear date"
              variant="link"
              size="small"
              fullWidth={false}
              disabled={donationBusy}
              onPress={() => {
                setDonationDate(null);
                saveDonationDate(null);
              }}
              accessibilityHint="Removes your recorded donation date"
            />
          ) : null}
        </View>
      </Card>

      {/* --- Details ------------------------------------------------------- */}

      {editing ? (
        <EditForm
          values={values}
          errors={errors}
          refs={refs}
          set={set}
          setValues={setValues}
          setErrors={setErrors}
          say={say}
          cityIsOther={cityIsOther}
          photo={photo}
          setPhoto={setPhoto}
          coords={coords}
          setCoords={setCoords}
          saving={saving}
          currentPhotoUrl={profile.profilePhotoUrl}
        />
      ) : (
        <Card title="Your details">
          {profile.profilePhotoUrl ? (
            <Image
              source={{ uri: profile.profilePhotoUrl }}
              style={styles.avatar}
              // The name below it is the information; the picture is decoration a reader
              // cannot describe.
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            />
          ) : null}

          <Detail label="Name" value={user?.name} />
          <Detail label="Mobile number" value={phoneOf(user)} spoken={spokenPhone(user)} />
          <Detail label="Email address" value={user?.email} />
          <Detail label="Blood group" value={bloodGroupLabel(profile.bloodGroup)} />
          <Detail label="Gender" value={genderLabel(profile.gender)} />
          <Detail label="Date of birth" value={formatDate(profile.dateOfBirth)} />
          <Detail
            label="Location"
            value={[profile.city, profile.district, profile.state].filter(Boolean).join(', ')}
          />
          <Detail label="PIN code" value={profile.pincode} />
          <Detail label="Address" value={profile.address} />
          <Detail
            label="Map position"
            value={
              profile.hasLocation
                ? 'Shared. We can measure your exact distance from a request.'
                : 'Not shared. We match you by district instead.'
            }
          />

          <AppButton
            title="Edit profile"
            variant="secondary"
            onPress={beginEdit}
            style={styles.edit}
            accessibilityHint="Opens your details for editing"
          />
        </Card>
      )}
    </Screen>
  );
}

/**
 * One labelled fact.
 *
 * `accessible` collapses the label and value into a single stop, so the reader says "Blood
 * group, O positive" as one phrase. Left ungrouped it is two swipes, and in a list of ten
 * facts the user has to hold each label in mind until the value arrives.
 */
function Detail({ label, value, spoken }) {
  const shown = value || 'Not set';
  return (
    <View accessible accessibilityLabel={`${label}, ${spoken ?? shown}`} style={styles.detail}>
      <AppText variant="caption" color={colors.textMuted}>
        {label}
      </AppText>
      <AppText variant="body" style={styles.detailValue}>
        {shown}
      </AppText>
    </View>
  );
}

/** The editable half, split out so the screen above stays readable. */
function EditForm({
  values,
  errors,
  refs,
  set,
  setValues,
  setErrors,
  say,
  cityIsOther,
  photo,
  setPhoto,
  coords,
  setCoords,
  saving,
  currentPhotoUrl,
}) {
  const districts = districtsOf(values.state);
  const cities = citiesOf(values.state, values.district);

  function setDistrict(district) {
    setValues((current) => ({ ...current, district, city: null, otherCity: '' }));
    setErrors((current) => ({ ...current, district: null, city: null }));
    say(`District set to ${district}. Now choose your city or town.`);
  }

  return (
    <>
      <Card title="Personal information">
        <AppTextInput
          ref={refs.fullName}
          label="Full name"
          required
          value={values.fullName}
          onChangeText={(text) => set('fullName', text)}
          error={errors.fullName}
          autoComplete="name"
          autoCapitalize="words"
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
          autoCapitalize="none"
        />

        <AppSelect
          ref={refs.bloodGroup}
          label="Blood group"
          required
          options={BLOOD_GROUP_OPTIONS}
          value={values.bloodGroup}
          onChange={(value) => set('bloodGroup', value)}
          error={errors.bloodGroup}
        />

        <AppSelect
          ref={refs.gender}
          label="Gender"
          required
          options={GENDER_OPTIONS}
          value={values.gender}
          onChange={(value) => set('gender', value)}
          error={errors.gender}
        />

        <AppDateInput
          ref={refs.dateOfBirth}
          label="Date of birth"
          value={values.dateOfBirth}
          onChange={(value) => set('dateOfBirth', value)}
          error={errors.dateOfBirth}
          helperText="Optional."
        />

        <PhotoPicker
          value={photo}
          onChange={setPhoto}
          disabled={saving}
          label={currentPhotoUrl ? 'Replace your profile photo' : 'Profile photo'}
        />
      </Card>

      <Card title="Location">
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
        />

        <AppSelect
          ref={refs.district}
          label="District"
          required
          options={districts}
          value={values.district}
          onChange={setDistrict}
          error={errors.district}
          disabled={!values.state}
        />

        <AppSelect
          ref={refs.city}
          label="City or town"
          required
          options={cities}
          value={values.city}
          onChange={(value) => set('city', value)}
          error={errors.city}
          disabled={!values.district}
          helperText="Choose Other if your town is not listed."
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
        />

        <LocationCapture value={coords} onChange={setCoords} disabled={saving} />
      </Card>
    </>
  );
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** An ISO timestamp from the API -> `YYYY-MM-DD` for `AppDateInput`. */
function toDateInput(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

/** `1990-03-15` -> `15 March 1990`. Spelled out, because "15/3/90" is read as a fraction. */
function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

const phoneOf = (user) => (user?.phone ? formatPhoneForDisplay(user.phone) : null);

/** Digits separated, so the reader says a phone number rather than a quantity. */
const spokenPhone = (user) =>
  user?.phone ? user.phone.replace(/\D/g, '').split('').join(' ') : 'Not set';

/**
 * The 90-day rule, stated as a sentence rather than a number the user has to interpret.
 *
 * This is guidance shown next to the date, not a rule the backend enforces — a donor who
 * knows their own circumstances can still mark themselves available.
 */
function describeEligibility(lastDonationDate) {
  if (!lastDonationDate) {
    return { summary: 'No donation recorded yet. Add the date if you have given blood before.' };
  }

  const last = new Date(lastDonationDate);
  const days = Math.floor((Date.now() - last.getTime()) / 86_400_000);
  const formatted = formatDate(lastDonationDate);

  if (days >= 90) {
    return { summary: `You last donated on ${formatted}, ${days} days ago. You are likely eligible to donate again.` };
  }

  return {
    summary: `You last donated on ${formatted}, ${days} days ago. Most donors wait about 90 days, so around ${90 - days} more days.`,
  };
}

const styles = StyleSheet.create({
  retry: { marginTop: spacing.lg, marginBottom: spacing.sm },
  note: { marginTop: spacing.md },
  eligibility: { marginBottom: spacing.lg },
  inlineActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  detail: { marginBottom: spacing.lg },
  detailValue: { marginTop: spacing.xs },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: radius.lg,
    backgroundColor: colors.background,
    marginBottom: spacing.lg,
  },
  edit: { marginTop: spacing.sm },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  footerAction: { flexGrow: 1, flexBasis: 140 },
});
