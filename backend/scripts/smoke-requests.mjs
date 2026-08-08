/**
 * End-to-end smoke test for the Phase 4 search + requests + matching APIs.
 *
 *   Terminal 1:  npm run dev
 *   Terminal 2:  npm run db:seed      (once — the checks lean on the Odisha donors)
 *   Terminal 3:  npm run smoke:requests
 *
 * Requires SMS_PROVIDER=console (it reads the OTP from the `devCode` field). Creates one
 * throwaway receiver and one blood request, and deletes both on the way out. Seeded
 * donors are only read from and logged in as; nothing about them is modified.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (process.env.NODE_ENV === 'production') {
  throw new Error('smoke-requests.mjs writes test data. Refusing to run with NODE_ENV=production.');
}

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

let failures = 0;
function check(label, ok, extra = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? ` — ${extra}` : ''}`);
  if (!ok) failures++;
}

async function api(method, path, body, token) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

async function loginByOtp(phone, role) {
  await prisma.otpCode.deleteMany({ where: { phone } });
  const requested = await api('POST', '/auth/otp/request', { phone });
  const verified = await api('POST', '/auth/otp/verify', { phone, code: requested.json.devCode, role });
  return verified.json;
}

// Bhubaneswar city centre — the seed scatters Khordha donors within ~6 km of it.
const BHUBANESWAR = { latitude: 20.2961, longitude: 85.8245 };

const RECEIVER_PHONE = '+919876500041';

async function cleanup() {
  const receiver = await prisma.user.findUnique({ where: { phone: RECEIVER_PHONE } });
  if (receiver) {
    // Matches cascade from the request; the request cascades from the requester.
    await prisma.bloodRequest.deleteMany({ where: { requesterId: receiver.id } });
    await prisma.user.delete({ where: { id: receiver.id } });
  }
  await prisma.otpCode.deleteMany({ where: { phone: RECEIVER_PHONE } });
}

await cleanup();

const donorCount = await prisma.donorProfile.count();
if (donorCount < 10) {
  console.error('Seed the database first: npm run db:seed --workspace backend');
  process.exit(1);
}

// ---- 0. sign in as a receiver ----------------------------------------------
const receiverAuth = await loginByOtp(RECEIVER_PHONE, 'RECEIVER');
const receiverToken = receiverAuth.accessToken;
check('OTP login as a receiver', Boolean(receiverToken));

const registered = await api(
  'POST',
  '/receivers/register',
  { fullName: 'Smoke Receiver', state: 'Odisha', district: 'Khordha', city: 'Bhubaneswar', ...BHUBANESWAR },
  receiverToken,
);
check('receiver registered', registered.status === 201, registered.json.error?.message);

// ---- 1. search by administrative area ---------------------------------------
const byArea = await api('GET', '/donors/search?state=odisha&district=Khordha', null, receiverToken);
check('area search returns donors', byArea.status === 200 && byArea.json.total > 0, byArea.json.error?.message);
check('area search reports its mode', byArea.json.mode === 'area' && byArea.json.radiusKm === null);
check('filters are case-insensitive', byArea.json.results.every((d) => d.district.toLowerCase() === 'khordha'));
check(
  'search result is announceable',
  typeof byArea.json.message === 'string' && byArea.json.message.includes('donor'),
  byArea.json.message,
);

const inactive = await prisma.user.findMany({ where: { status: { not: 'ACTIVE' } }, select: { id: true } });
const inactiveIds = new Set(inactive.map((u) => u.id));
const allOdisha = await api('GET', '/donors/search?state=Odisha&pageSize=100&availableOnly=false', null, receiverToken);
check(
  'DEAD and BLOCKED donors never appear in search',
  allOdisha.json.results.every((d) => !inactiveIds.has(d.userId)),
);

const availableOnly = await api('GET', '/donors/search?state=Odisha&pageSize=100', null, receiverToken);
check('availableOnly defaults to true', availableOnly.json.results.every((d) => d.isAvailable === true));
check(
  'availableOnly=false widens the result',
  allOdisha.json.total > availableOnly.json.total,
  `${allOdisha.json.total} vs ${availableOnly.json.total}`,
);

// ---- 2. PII: an app user must not learn where a donor lives -----------------
const sample = availableOnly.json.results[0];
check('search returns a callable phone number', typeof sample.phone === 'string' && sample.phone.startsWith('+'));
check(
  'search hides the street address, PIN code and exact position from app users',
  sample.address === undefined && sample.pincode === undefined && sample.latitude === undefined,
);

const staffLogin = await api('POST', '/auth/staff/login', {
  email: process.env.SEED_ADMIN_EMAIL ?? 'admin@redexpress.local',
  password: process.env.SEED_ADMIN_PASSWORD ?? 'change-me-before-production',
});
const staffToken = staffLogin.json.accessToken;
if (staffToken) {
  const staffSearch = await api('GET', '/donors/search?state=Odisha&pageSize=5', null, staffToken);
  check('staff do see the full record', typeof staffSearch.json.results[0]?.address === 'string');
} else {
  check('staff login for the PII comparison', false, staffLogin.json.error?.message);
}

// ---- 3. proximity search -----------------------------------------------------
const radiusKm = 30;
// Short lat/lng names, the ones the mobile screen sends.
const near = await api(
  'GET',
  `/donors/search?lat=${BHUBANESWAR.latitude}&lng=${BHUBANESWAR.longitude}&radiusKm=${radiusKm}&pageSize=100`,
  null,
  receiverToken,
);
check('proximity search succeeds', near.status === 200 && near.json.mode === 'proximity', near.json.error?.message);
check('every result carries a distance', near.json.results.every((d) => typeof d.distanceKm === 'number'));
check('nothing beyond the radius comes back', near.json.results.every((d) => d.distanceKm <= radiusKm));
check(
  'results are sorted nearest first',
  near.json.results.every((d, i, all) => i === 0 || all[i - 1].distanceKm <= d.distanceKm),
);

const tiny = await api(
  'GET',
  `/donors/search?latitude=${BHUBANESWAR.latitude}&longitude=${BHUBANESWAR.longitude}&radiusKm=1`,
  null,
  receiverToken,
);
check('a smaller radius returns a subset', tiny.json.total <= near.json.total);

const halfPosition = await api('GET', '/donors/search?latitude=20.29', null, receiverToken);
check('latitude without longitude is rejected', halfPosition.status === 400 && !!halfPosition.json.error.fields?.latitude);

const strayRadius = await api('GET', '/donors/search?radiusKm=10', null, receiverToken);
check('a radius with no position is rejected', strayRadius.status === 400 && !!strayRadius.json.error.fields?.radiusKm);

const anon = await api('GET', '/donors/search?state=Odisha');
check('search requires a signed-in caller', anon.status === 401);

// ---- 4. blood-group compatibility -------------------------------------------
const exact = await api('GET', '/donors/search?state=Odisha&bloodGroup=AB%2B&pageSize=100', null, receiverToken);
check('"AB+" is accepted and narrowed to AB_POS', exact.json.filters?.compatibleGroups?.join() === 'AB_POS');
check('exact search returns only that group', exact.json.results.every((d) => d.bloodGroup === 'AB_POS'));

const compatible = await api(
  'GET',
  '/donors/search?state=Odisha&bloodGroup=AB_POS&compatible=true&pageSize=100',
  null,
  receiverToken,
);
check('AB positive is the universal recipient', compatible.json.filters.compatibleGroups.length === 8);
check('compatible search is a superset', compatible.json.total >= exact.json.total);

const oNegOnly = await api(
  'GET',
  '/donors/search?state=Odisha&bloodGroup=O_NEG&compatible=true&pageSize=100',
  null,
  receiverToken,
);
check(
  'an O negative patient is only offered O negative donors',
  oNegOnly.json.results.every((d) => d.bloodGroup === 'O_NEG'),
);

// ---- 5. posting a request runs the matching engine ---------------------------
const created = await api(
  'POST',
  '/requests',
  {
    bloodGroup: 'A+',
    unitsNeeded: 2,
    hospitalName: 'AIIMS Bhubaneswar',
    contactPhone: '9876500041',
    urgency: 'URGENT',
    note: 'Smoke test request',
    state: 'Odisha',
    district: 'Khordha',
    city: 'Bhubaneswar',
    ...BHUBANESWAR,
  },
  receiverToken,
);
check('POST /requests returns 201', created.status === 201, created.json.error?.message);

const requestId = created.json.request?.id;
check('the request is OPEN with a 24 hour default expiry', created.json.request?.status === 'OPEN');
check(
  'expiry defaults to about 24 hours out',
  Math.abs(new Date(created.json.request.expiresAt) - Date.now() - 24 * 3600e3) < 60_000,
);
check('the contact number is normalised to E.164', created.json.request.contactPhone === '+919876500041');
check('matching ran and reported its steps', Array.isArray(created.json.matching?.steps) && created.json.matching.steps.length > 0);
check(
  'radius expansion walked outwards',
  created.json.matching.steps.every((s, i, all) => i === 0 || all[i - 1].radiusKm < s.radiusKm),
  JSON.stringify(created.json.matching.steps),
);
check('donors were matched', created.json.matching.matchedCount > 0, JSON.stringify(created.json.matching));
check(
  'the response says what happened in plain words',
  typeof created.json.message === 'string' && created.json.message.includes('Request posted'),
  created.json.message,
);

// ---- 6. the matches are the right people ------------------------------------
const stored = await prisma.requestMatch.findMany({
  where: { requestId },
  include: { donor: { select: { status: true, id: true, donorProfile: { select: { bloodGroup: true, isAvailable: true } } } } },
});
check('matches were written to the database', stored.length === created.json.matching.matchedCount);
check('every matched donor is ACTIVE', stored.every((m) => m.donor.status === 'ACTIVE'));
check('every matched donor is available', stored.every((m) => m.donor.donorProfile.isAvailable));
check(
  'every matched donor can actually donate to A positive',
  stored.every((m) => ['O_NEG', 'O_POS', 'A_NEG', 'A_POS'].includes(m.donor.donorProfile.bloodGroup)),
  [...new Set(stored.map((m) => m.donor.donorProfile.bloodGroup))].join(),
);
check('the requester was not matched to their own request', stored.every((m) => m.donorUserId !== created.json.request.requesterId));
check(
  'each match stores the distance at match time',
  stored.every((m) => typeof m.distanceKm === 'number' && m.distanceKm <= 50),
);

const rerun = await api('POST', `/requests`, {
  bloodGroup: 'A+',
  unitsNeeded: 1,
  hospitalName: 'AIIMS Bhubaneswar',
  contactPhone: '9876500041',
  district: 'Khordha',
  state: 'Odisha',
  ...BHUBANESWAR,
}, receiverToken);
await prisma.bloodRequest.delete({ where: { id: rerun.json.request.id } });
check('a second identical request matches the same donors again', rerun.json.matching.matchedCount === created.json.matching.matchedCount);

// ---- 6b. a request with no coordinates falls back to district matching -------
const areaRequest = await api(
  'POST',
  '/requests',
  {
    bloodGroup: 'O+',
    unitsNeeded: 1,
    hospitalName: 'Capital Hospital',
    contactPhone: '9876500041',
    state: 'Odisha',
    district: 'Cuttack',
  },
  receiverToken,
);
check('a request with no position is accepted', areaRequest.status === 201, areaRequest.json.error?.message);
check('it falls back to area matching', areaRequest.json.matching?.strategy === 'area' && areaRequest.json.matching.fellBackToArea === true);
check('area matching reports which scope it used', areaRequest.json.matching.steps.every((s) => ['district', 'state'].includes(s.scope)));

const areaMatches = await prisma.requestMatch.findMany({ where: { requestId: areaRequest.json.request.id } });
check('area matches are stored with no distance rather than a fake zero', areaMatches.every((m) => m.distanceKm === null));
check('area matching still found donors', areaMatches.length > 0);
await prisma.bloodRequest.delete({ where: { id: areaRequest.json.request.id } });

// ---- 7. reading the worklist -------------------------------------------------
const worklist = await api('GET', `/requests/${requestId}/matches`, null, receiverToken);
check('GET /requests/:id/matches returns the list', worklist.status === 200 && worklist.json.matches.length === stored.length);
check(
  'the worklist is sorted nearest first',
  worklist.json.matches.every((m, i, all) => i === 0 || all[i - 1].distanceKm <= m.distanceKm),
);
check('response counts start at all pending', worklist.json.counts.PENDING === stored.length && worklist.json.counts.ACCEPTED === 0);

// ---- 8. a donor answering the notification ----------------------------------
const firstMatch = worklist.json.matches[0];
const donorAuth = await loginByOtp(firstMatch.donor.phone, 'DONOR');
const donorToken = donorAuth.accessToken;
check('a matched donor can sign in', Boolean(donorToken), donorAuth.error?.message);

const donorSees = await api('GET', `/requests/${requestId}`, null, donorToken);
check('a matched donor can open the request', donorSees.status === 200 && donorSees.json.canRespond === true);
check('a matched donor is given the hospital and contact number', typeof donorSees.json.request.contactPhone === 'string');
check('the donor is told how far away it is', typeof donorSees.json.request.myMatch?.distanceKm === 'number');

const wrongDonor = await api('POST', `/requests/${requestId}/matches/${firstMatch.donorUserId}/respond`, { response: 'ACCEPTED' }, receiverToken);
check('only the donor themselves may answer', wrongDonor.status === 403);

const accepted = await api('POST', `/requests/${requestId}/matches/${firstMatch.donorUserId}/respond`, { response: 'ACCEPTED' }, donorToken);
check('a donor can accept', accepted.status === 200 && accepted.json.match.response === 'ACCEPTED', accepted.json.error?.message);
check('accepting is counted', accepted.json.acceptedCount === 1);
check('accepting unlocks the hospital details', typeof accepted.json.request.contactPhone === 'string');

const declined = await api('POST', `/requests/${requestId}/matches/${firstMatch.donorUserId}/respond`, { response: 'DECLINED' }, donorToken);
check('a donor may change their answer', declined.status === 200 && declined.json.match.response === 'DECLINED');

const badResponse = await api('POST', `/requests/${requestId}/matches/${firstMatch.donorUserId}/respond`, { response: 'PENDING' }, donorToken);
check('PENDING is not an answer', badResponse.status === 400);

// A donor who was never matched must not be able to answer or read the request.
const unmatched = await prisma.user.findFirst({
  where: { role: 'DONOR', status: 'ACTIVE', matches: { none: { requestId } } },
  select: { phone: true },
});
if (unmatched) {
  const otherAuth = await loginByOtp(unmatched.phone, 'DONOR');
  const otherSees = await api('GET', `/requests/${requestId}`, null, otherAuth.accessToken);
  check('an unmatched donor cannot open the request', otherSees.status === 403, `got ${otherSees.status}`);
} else {
  console.log('SKIP  unmatched-donor check — every seeded donor was matched');
}

// ---- 9. listing and closing --------------------------------------------------
const mine = await api('GET', '/requests', null, receiverToken);
check('a receiver sees their own requests', mine.status === 200 && mine.json.results.some((r) => r.id === requestId));

const asAll = await api('GET', '/requests?scope=all', null, receiverToken);
check('an app user cannot list everyone\'s requests', asAll.status === 403);

const matchedScope = await api('GET', '/requests?scope=matched', null, donorToken);
check('a donor can list the requests they were asked about', matchedScope.json.results.some((r) => r.id === requestId));

const donorClose = await api('PATCH', `/requests/${requestId}/status`, { status: 'CANCELLED' }, donorToken);
check('a matched donor cannot close someone else\'s request', donorClose.status === 403);

const fulfilled = await api('PATCH', `/requests/${requestId}/status`, { status: 'FULFILLED' }, receiverToken);
check('the requester can close the request', fulfilled.status === 200 && fulfilled.json.request.status === 'FULFILLED');

const lateAnswer = await api('POST', `/requests/${requestId}/matches/${firstMatch.donorUserId}/respond`, { response: 'ACCEPTED' }, donorToken);
check('a closed request stops accepting answers', lateAnswer.status === 409 && lateAnswer.json.error.code === 'REQUEST_CLOSED');

// ---- 10. validation ----------------------------------------------------------
const noLocation = await api('POST', '/requests', {
  bloodGroup: 'B+', unitsNeeded: 1, hospitalName: 'Nowhere', contactPhone: '9876500041',
}, receiverToken);
check('a request with no location at all is rejected', noLocation.status === 400 && !!noLocation.json.error.fields?.district);

const badPhone = await api('POST', '/requests', {
  bloodGroup: 'B+', unitsNeeded: 1, hospitalName: 'Nowhere', contactPhone: '123', district: 'Khordha',
}, receiverToken);
check('a bad contact number lands on the right field', badPhone.status === 400 && !!badPhone.json.error.fields?.contactPhone);

const pastExpiry = await api('POST', '/requests', {
  bloodGroup: 'B+', unitsNeeded: 1, hospitalName: 'Nowhere', contactPhone: '9876500041',
  district: 'Khordha', expiresAt: '2020-01-01T00:00:00Z',
}, receiverToken);
check('an expiry in the past is rejected', pastExpiry.status === 400 && !!pastExpiry.json.error.fields?.expiresAt);

const missing = await api('GET', '/requests/does-not-exist', null, receiverToken);
check('an unknown request is a 404', missing.status === 404 && missing.json.error.code === 'REQUEST_NOT_FOUND');

// ---- cleanup ----------------------------------------------------------------
await cleanup();
await prisma.$disconnect();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
