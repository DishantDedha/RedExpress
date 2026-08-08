/**
 * End-to-end smoke test for the Phase 3 registration + profile APIs.
 *
 *   Terminal 1:  npm run dev
 *   Terminal 2:  npm run smoke:profiles
 *
 * Requires SMS_PROVIDER=console (it reads the OTP from the `devCode` field) and
 * STORAGE_DRIVER=local. Creates and deletes its own throwaway users.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (process.env.NODE_ENV === 'production') {
  throw new Error('smoke-profiles.mjs writes test data. Refusing to run with NODE_ENV=production.');
}

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

async function api(method, path, body, token) {
  const isForm = body instanceof FormData;
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(isForm || !body ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

/** Runs the Phase 2 OTP flow and returns a usable access token. */
async function loginByOtp(phone, role) {
  const e164 = `+91${phone}`;
  await prisma.otpCode.deleteMany({ where: { phone: e164 } });
  const requested = await api('POST', '/auth/otp/request', { phone });
  const verified = await api('POST', '/auth/otp/verify', { phone, code: requested.json.devCode, role });
  return verified.json;
}

/** A minimal but genuine 1x1 PNG, so the MIME sniffing is exercised for real. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const DONOR_PHONE = '9876500031';
const RECEIVER_PHONE = '9876500032';
const PHONES = [`+91${DONOR_PHONE}`, `+91${RECEIVER_PHONE}`];

async function cleanup() {
  await prisma.otpCode.deleteMany({ where: { phone: { in: PHONES } } });
  await prisma.user.deleteMany({ where: { phone: { in: PHONES } } });
}

await cleanup();

// ---- 1. donor registration --------------------------------------------------
const donorAuth = await loginByOtp(DONOR_PHONE, 'DONOR');
const donorToken = donorAuth.accessToken;
check('OTP login returns a token for a new donor', !!donorToken && donorAuth.isNewUser);
check('new account is not profileComplete', donorAuth.profileComplete === false);

const before = await api('GET', '/donors/me', null, donorToken);
check('GET /donors/me before registering is 404', before.status === 404 && before.json.error.code === 'PROFILE_NOT_FOUND');

function donorForm(overrides = {}) {
  const form = new FormData();
  const fields = {
    fullName: 'Test Donor',
    email: 'test.donor@redexpress.local',
    phone: DONOR_PHONE,
    bloodGroup: 'O+', // the "A+" style the mobile select shows, not the enum
    gender: 'male',
    state: 'Odisha',
    district: 'Khordha',
    city: 'Bhubaneswar',
    pincode: '751001',
    address: 'Plot 42, Saheed Nagar',
    latitude: '20.2961',
    longitude: '85.8245',
    ...overrides,
  };
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined) form.append(key, String(value));
  }
  return form;
}

const withPhoto = donorForm();
withPhoto.append('profilePhoto', new Blob([PNG_1PX], { type: 'image/png' }), 'avatar.png');

const registered = await api('POST', '/donors/register', withPhoto, donorToken);
check('POST /donors/register returns 201', registered.status === 201, registered.json.error?.message);
check('role promoted to DONOR', registered.json.user?.role === 'DONOR');
check('"O+" normalised to the O_POS enum', registered.json.donorProfile?.bloodGroup === 'O_POS');
check('lowercase "male" normalised to MALE', registered.json.donorProfile?.gender === 'MALE');
check('device coordinates stored', registered.json.donorProfile?.latitude === 20.2961 && registered.json.locationSource === 'device');
check('donor defaults to available', registered.json.donorProfile?.isAvailable === true);

const photoUrl = registered.json.donorProfile?.profilePhotoUrl;
check('profile photo stored and given a URL', typeof photoUrl === 'string' && photoUrl.includes('/uploads/profiles/'));
const photoFetch = await fetch(photoUrl);
check('uploaded photo is publicly served', photoFetch.status === 200 && photoFetch.headers.get('content-type')?.includes('png'));

const duplicate = await api('POST', '/donors/register', donorForm(), donorToken);
check('registering twice is a 409', duplicate.status === 409 && duplicate.json.error.code === 'PROFILE_EXISTS');

// ---- 2. validation ----------------------------------------------------------
const badPin = await api('POST', '/donors/register', donorForm({ pincode: '12' }), donorToken);
check('bad PIN code returns a fields map', badPin.status === 400 && !!badPin.json.error.fields?.pincode);

const wrongPhone = await api('POST', '/donors/register', donorForm({ phone: '9999999999' }), donorToken);
check('phone that differs from the session is rejected', wrongPhone.status === 400 && wrongPhone.json.error.code === 'PHONE_MISMATCH');

const halfLocation = await api('POST', '/donors/register', donorForm({ longitude: undefined }), donorToken);
check('latitude without longitude is rejected', halfLocation.status === 400 && !!halfLocation.json.error.fields?.latitude);

const underage = await api('POST', '/donors/register', donorForm({ dateOfBirth: '2015-01-01' }), donorToken);
check('under-18 date of birth is rejected', underage.status === 400 && !!underage.json.error.fields?.dateOfBirth);

// ---- 3. uploads -------------------------------------------------------------
const badTypeForm = donorForm();
badTypeForm.append('profilePhoto', new Blob([Buffer.from('#!/bin/sh')], { type: 'text/x-shellscript' }), 'evil.sh');
const badType = await api('POST', '/donors/register', badTypeForm, donorToken);
check('unsupported file type is rejected', badType.status === 400 && badType.json.error.code === 'UNSUPPORTED_FILE_TYPE');

const bigForm = donorForm();
bigForm.append('profilePhoto', new Blob([Buffer.alloc(3 * 1024 * 1024)], { type: 'image/jpeg' }), 'big.jpg');
const tooBig = await api('POST', '/donors/register', bigForm, donorToken);
check('file over 2 MB is rejected', tooBig.status === 400 && tooBig.json.error.code === 'FILE_TOO_LARGE', tooBig.json.error?.code);

// ---- 4. reading and updating ------------------------------------------------
const mine = await api('GET', '/donors/me', null, donorToken);
check('GET /donors/me returns the profile', mine.status === 200 && mine.json.donorProfile.city === 'Bhubaneswar');

const patched = await api('PATCH', '/donors/me', { city: 'Cuttack', district: 'Cuttack', bloodGroup: 'AB_NEG' }, donorToken);
check('PATCH /donors/me updates fields', patched.status === 200 && patched.json.donorProfile.city === 'Cuttack');
check('PATCH accepts a JSON body as well as multipart', patched.json.donorProfile.bloodGroup === 'AB_NEG');

const emptyPatch = await api('PATCH', '/donors/me', {}, donorToken);
check('empty PATCH is rejected', emptyPatch.status === 400);

const availability = await api('PATCH', '/donors/me/availability', { isAvailable: false }, donorToken);
check('availability toggles off', availability.status === 200 && availability.json.donorProfile.isAvailable === false);
check('availability change is announced in plain words', typeof availability.json.message === 'string' && availability.json.message.length > 0);

const lastDonation = await api('PATCH', '/donors/me/last-donation', { date: '2026-01-15' }, donorToken);
check('last donation date saved', lastDonation.status === 200 && lastDonation.json.donorProfile.lastDonationDate.startsWith('2026-01-15'));

const futureDonation = await api('PATCH', '/donors/me/last-donation', { date: '2099-01-01' }, donorToken);
check('future donation date rejected', futureDonation.status === 400 && !!futureDonation.json.error.fields?.date);

const clearedDonation = await api('PATCH', '/donors/me/last-donation', { date: null }, donorToken);
check('last donation date can be cleared', clearedDonation.status === 200 && clearedDonation.json.donorProfile.lastDonationDate === null);

// Replacing the photo must delete the previous file rather than leak it.
const replaceForm = new FormData();
replaceForm.append('profilePhoto', new Blob([PNG_1PX], { type: 'image/png' }), 'new.png');
const replaced = await api('PATCH', '/donors/me', replaceForm, donorToken);
check('photo replaced with a new URL', replaced.status === 200 && replaced.json.donorProfile.profilePhotoUrl !== photoUrl);
check('the replaced file is deleted from storage', (await fetch(photoUrl)).status === 404);

const removed = await api('PATCH', '/donors/me', { removePhoto: true }, donorToken);
check('photo can be removed', removed.status === 200 && removed.json.donorProfile.profilePhotoUrl === null);

// ---- 5. GET /me -------------------------------------------------------------
const meDonor = await api('GET', '/me', null, donorToken);
check('GET /me returns user + donor profile', meDonor.status === 200 && meDonor.json.donorProfile?.userId === meDonor.json.user.id);
check('GET /me reports profileComplete', meDonor.json.profileComplete === true);
check('GET /me never leaks the password hash', !JSON.stringify(meDonor.json).includes('passwordHash'));

const meAnon = await api('GET', '/me');
check('GET /me without a token is 401', meAnon.status === 401);

// ---- 6. receiver registration ----------------------------------------------
const receiverAuth = await loginByOtp(RECEIVER_PHONE, 'RECEIVER');
const receiverToken = receiverAuth.accessToken;

const receiver = await api(
  'POST',
  '/receivers/register',
  { fullName: 'Test Receiver', state: 'Odisha', district: 'Puri', phone: RECEIVER_PHONE, latitude: 19.8135, longitude: 85.8312 },
  receiverToken,
);
check('POST /receivers/register returns 201', receiver.status === 201, receiver.json.error?.message);
check('receiver role and location stored on the user', receiver.json.user?.role === 'RECEIVER' && receiver.json.user.district === 'Puri');
check('receiver gets no donor profile', receiver.json.donorProfile === null);

const receiverDonorRead = await api('GET', '/donors/me', null, receiverToken);
check('a receiver has no donor profile to read', receiverDonorRead.status === 404);

const missingDistrict = await api('POST', '/receivers/register', { fullName: 'X', state: 'Odisha' }, receiverToken);
check('receiver form requires a district', missingDistrict.status === 400 && !!missingDistrict.json.error.fields?.district);

// The donor above already owns this address; the unique constraint must surface as a
// readable 409 rather than a 500.
const takenEmail = await api(
  'POST',
  '/receivers/register',
  { fullName: 'Test Receiver', state: 'Odisha', district: 'Puri', email: 'test.donor@redexpress.local' },
  receiverToken,
);
check('an email already in use is a 409', takenEmail.status === 409 && takenEmail.json.error.code === 'EMAIL_IN_USE', takenEmail.json.error?.code);

// ---- 7. staff are kept out of the app flows --------------------------------
const staff = await api('POST', '/auth/staff/login', {
  email: 'staff1@redexpress.local',
  password: process.env.SEED_STAFF_PASSWORD,
});
const staffDonor = await api('POST', '/donors/register', donorForm({ phone: undefined }), staff.json.accessToken);
check('staff cannot register as a donor', staffDonor.status === 403 && staffDonor.json.error.code === 'APP_ACCOUNT_REQUIRED');

const staffMe = await api('GET', '/me', null, staff.json.accessToken);
check('GET /me works for staff too', staffMe.status === 200 && staffMe.json.user.role === 'STAFF' && staffMe.json.donorProfile === null);

// ---- 8. a dead donor cannot edit their profile ------------------------------
const donorId = registered.json.user.id;
await prisma.user.update({ where: { id: donorId }, data: { status: 'DEAD', tokenVersion: { increment: 1 } } });
const afterDead = await api('PATCH', '/donors/me/availability', { isAvailable: true }, donorToken);
check(
  'a donor marked dead is forced back to login',
  afterDead.status === 401 && afterDead.json.error.code === 'TOKEN_VERSION_MISMATCH',
  afterDead.json.error?.code,
);

// ---- cleanup ----------------------------------------------------------------
await cleanup();
await prisma.$disconnect();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
