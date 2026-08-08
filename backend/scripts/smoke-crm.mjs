/**
 * End-to-end smoke test for the Phase 6 CRM APIs.
 *
 *   Terminal 1:  npm run dev
 *   Terminal 2:  npm run db:seed        (once — the checks lean on the Odisha donors)
 *   Terminal 3:  npm run smoke:crm
 *
 * Requires SMS_PROVIDER=console (it reads the OTP from the `devCode` field). Works with
 * PUSH_PROVIDER=console; no device needed.
 *
 * The centrepiece is the lifecycle loop, verified end to end rather than asserted:
 *
 *   donor signs in  →  staff mark them dead  →  the donor's existing access token is
 *   rejected with TOKEN_VERSION_MISMATCH  →  the donor disappears from search  →  the
 *   donor re-verifies by OTP  →  they are ACTIVE and searchable again.
 *
 * Creates one throwaway receiver and one blood request, and marks one seeded donor dead.
 * All of it is undone on the way out — including the donor's status, availability, call
 * logs and audit rows — so the script can be run repeatedly against the same seed.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (process.env.NODE_ENV === 'production') {
  throw new Error('smoke-crm.mjs writes test data. Refusing to run with NODE_ENV=production.');
}

const API = process.env.SMOKE_API_BASE_URL ?? 'http://localhost:4000';
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@redexpress.local';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'change-me-before-production';
const STAFF_EMAIL = process.env.SEED_STAFF_EMAIL ?? 'staff1@redexpress.local';
const STAFF_PASSWORD = process.env.SEED_STAFF_PASSWORD ?? 'change-me-before-production';

const RECEIVER_PHONE = '+919876500061';
// Bhubaneswar city centre — the seed scatters Khordha donors within ~6 km of it.
const BHUBANESWAR = { latitude: 20.2961, longitude: 85.8245 };

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

let victimUserId = null;
let victimOriginalStatus = null;
let victimOriginalAvailability = null;

async function cleanup() {
  const receiver = await prisma.user.findUnique({ where: { phone: RECEIVER_PHONE } });
  if (receiver) {
    // Matches, call logs and audit rows cascade from the request and the users.
    await prisma.bloodRequest.deleteMany({ where: { requesterId: receiver.id } });
    await prisma.notification.deleteMany({ where: { userId: receiver.id } });
    await prisma.user.delete({ where: { id: receiver.id } });
  }
  await prisma.otpCode.deleteMany({ where: { phone: RECEIVER_PHONE } });

  if (victimUserId) {
    await prisma.callLog.deleteMany({ where: { donorUserId: victimUserId } });
    await prisma.auditLog.deleteMany({ where: { targetUserId: victimUserId } });
    await prisma.notification.deleteMany({ where: { userId: victimUserId } });
    if (victimOriginalStatus) {
      await prisma.user.update({ where: { id: victimUserId }, data: { status: victimOriginalStatus } });
    }
    if (victimOriginalAvailability !== null) {
      await prisma.donorProfile.updateMany({
        where: { userId: victimUserId },
        data: { isAvailable: victimOriginalAvailability },
      });
    }
  }
}

/**
 * A crash halfway through would otherwise leave a seeded donor marked DEAD and a pile of
 * call logs behind, and the next run would fail on the mess rather than on the code.
 */
for (const signal of ['uncaughtException', 'unhandledRejection']) {
  process.on(signal, async (err) => {
    console.error(`\n${signal}:`, err);
    await cleanup().catch(() => {});
    await prisma.$disconnect().catch(() => {});
    process.exit(1);
  });
}

await cleanup();

if ((await prisma.donorProfile.count()) < 10) {
  console.error('Seed the database first: npm run db:seed --workspace backend');
  process.exit(1);
}

// ---- 0. sign in ---------------------------------------------------------------

const staffAuth = await api('POST', '/auth/staff/login', { email: STAFF_EMAIL, password: STAFF_PASSWORD });
const staffToken = staffAuth.json.accessToken;
check('staff signs in', staffAuth.status === 200 && Boolean(staffToken), staffAuth.json.error?.message);

const adminAuth = await api('POST', '/auth/staff/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
const adminToken = adminAuth.json.accessToken;
check('admin signs in', adminAuth.status === 200 && Boolean(adminToken), adminAuth.json.error?.message);

if (!staffToken || !adminToken) {
  console.error('\nCannot continue without staff credentials. Check SEED_ADMIN_* / SEED_STAFF_* in backend/.env.');
  await cleanup();
  await prisma.$disconnect();
  process.exit(1);
}

// A Khordha donor with coordinates — near enough to Bhubaneswar to be matched by radius.
const victim = await prisma.donorProfile.findFirst({
  where: {
    district: { equals: 'Khordha', mode: 'insensitive' },
    isAvailable: true,
    latitude: { not: null },
    user: { status: 'ACTIVE' },
  },
  include: { user: true },
});

if (!victim) {
  console.error('No seeded Khordha donor with coordinates found. Re-run npm run db:seed.');
  await cleanup();
  await prisma.$disconnect();
  process.exit(1);
}

victimUserId = victim.userId;
victimOriginalStatus = victim.user.status;
victimOriginalAvailability = victim.isAvailable;

const donorAuth = await loginByOtp(victim.user.phone, 'DONOR');
const donorToken = donorAuth.accessToken;
check('the donor signs in on the app', Boolean(donorToken), donorAuth.error?.message);

// ---- 1. access control --------------------------------------------------------

const anonymous = await api('GET', '/crm/stats');
check('anonymous callers are rejected', anonymous.status === 401, `got ${anonymous.status}`);

const asDonor = await api('GET', '/crm/stats', null, donorToken);
check('donors cannot read CRM endpoints', asDonor.status === 403, `got ${asDonor.status}`);

// ---- 2. stats -----------------------------------------------------------------

const stats = await api('GET', '/crm/stats', null, staffToken);
check('stats returns donor counts by blood group', stats.status === 200 && stats.json.donors?.byBloodGroup?.length === 8);
check(
  'stats counts donors by status',
  typeof stats.json.donors?.byStatus?.ACTIVE === 'number' && typeof stats.json.donors?.byStatus?.DEAD === 'number',
);
check('stats reports open requests and today\'s activity', typeof stats.json.requests?.open === 'number' && typeof stats.json.today?.matches === 'number');

// ---- 3. user search -----------------------------------------------------------

const byName = await api('GET', `/crm/users/search?q=${encodeURIComponent(victim.user.name.split(' ')[0])}`, null, staffToken);
check(
  'search finds a donor by name',
  byName.status === 200 && byName.json.results.some((row) => row.id === victim.userId),
  byName.json.error?.message,
);

const localNumber = victim.user.phone.replace('+91', '');
const byPhone = await api('GET', `/crm/users/search?q=${localNumber}`, null, staffToken);
check(
  'search finds a donor by the 10 digit number they read out',
  byPhone.status === 200 && byPhone.json.results.some((row) => row.id === victim.userId),
);

const filtered = await api(
  'GET',
  `/crm/users/search?role=DONOR&bloodGroup=${victim.bloodGroup}&district=Khordha&status=ACTIVE`,
  null,
  staffToken,
);
check(
  'filters compose (role + blood group + district + status)',
  filtered.status === 200 &&
    filtered.json.results.length > 0 &&
    filtered.json.results.every((row) => row.role === 'DONOR' && row.bloodGroup === victim.bloodGroup && row.status === 'ACTIVE'),
  filtered.json.error?.message,
);

const searchRow = byName.json.results.find((row) => row.id === victim.userId);
check('search rows carry a call summary', searchRow && 'lastCall' in searchRow && searchRow.callCount === 0);

// ---- 4. a request and its worklist --------------------------------------------

const receiverAuth = await loginByOtp(RECEIVER_PHONE, 'RECEIVER');
const receiverToken = receiverAuth.accessToken;
await api(
  'POST',
  '/receivers/register',
  { fullName: 'Smoke CRM', state: 'Odisha', district: 'Khordha', city: 'Bhubaneswar', ...BHUBANESWAR },
  receiverToken,
);

const created = await api(
  'POST',
  '/requests',
  {
    bloodGroup: victim.bloodGroup,
    unitsNeeded: 2,
    hospitalName: 'Capital Hospital',
    contactPhone: RECEIVER_PHONE,
    urgency: 'URGENT',
    ...BHUBANESWAR,
    state: 'Odisha',
    district: 'Khordha',
    city: 'Bhubaneswar',
  },
  receiverToken,
);
const requestId = created.json.request?.id;
check('a blood request is posted and matched', created.status === 201 && Boolean(requestId), created.json.error?.message);

const worklist = await api('GET', `/crm/donors/nearby?requestId=${requestId}`, null, staffToken);
check('the worklist returns matched donors', worklist.status === 200 && worklist.json.donors.length > 0, worklist.json.error?.message);
check('the worklist comes from stored matches', worklist.json.source === 'matches');
check(
  'the worklist is sorted nearest first',
  worklist.json.donors.every((row, i, all) => i === 0 || (all[i - 1].distanceKm ?? Infinity) <= (row.distanceKm ?? Infinity)),
);
check(
  'each worklist row has a phone number to call',
  worklist.json.donors.every((row) => typeof row.donor?.phone === 'string' && row.donor.phone.length > 0),
);
check('the marked donor is on the worklist', worklist.json.donors.some((row) => row.donorUserId === victim.userId));

const missingRequest = await api('GET', '/crm/donors/nearby?requestId=does-not-exist', null, staffToken);
check('an unknown request id is a 404', missingRequest.status === 404, `got ${missingRequest.status}`);

// ---- 5. call logs -------------------------------------------------------------

const noAnswer = await api(
  'POST',
  '/crm/call-logs',
  { donorUserId: victim.userId, requestId, outcome: 'NO_ANSWER', note: 'Rang twice, no answer.' },
  staffToken,
);
check('a call attempt is recorded', noAnswer.status === 201 && noAnswer.json.callLog?.outcome === 'NO_ANSWER', noAnswer.json.error?.message);
check('the response carries the fresh history', noAnswer.json.history?.length === 1);

const secondAttempt = await api(
  'POST',
  '/crm/call-logs',
  { donorUserId: victim.userId, requestId, outcome: 'NO_ANSWER' },
  staffToken,
);
check('a second attempt appends to the history', secondAttempt.json.history?.length === 2);

const forbiddenOutcome = await api(
  'POST',
  '/crm/call-logs',
  { donorUserId: victim.userId, outcome: 'MARKED_DEAD' },
  staffToken,
);
check('MARKED_DEAD cannot be written as an ordinary call outcome', forbiddenOutcome.status === 400, `got ${forbiddenOutcome.status}`);

const afterCalls = await api('GET', `/crm/users/${victim.userId}`, null, staffToken);
check('user detail shows the call history', afterCalls.status === 200 && afterCalls.json.calls?.length === 2, afterCalls.json.error?.message);
check('user detail exposes the full address to staff', Boolean(afterCalls.json.donorProfile?.address));
check('user detail shows coordinates', typeof afterCalls.json.location?.latitude === 'number');

// ---- 6. mark dead — the key action --------------------------------------------

const staffReactivateAttempt = await api('POST', `/crm/donors/${victim.userId}/reactivate`, {}, staffToken);
check('STAFF cannot reactivate', staffReactivateAttempt.status === 403, `got ${staffReactivateAttempt.status}`);

const marked = await api(
  'POST',
  `/crm/donors/${victim.userId}/mark-dead`,
  { requestId, note: 'Number rings out. Three attempts over two days.' },
  staffToken,
);
check('STAFF can mark a donor unreachable', marked.status === 200 && marked.json.user?.status === 'DEAD', marked.json.error?.message);
check('the token version was bumped', marked.json.effects?.tokenVersion === victim.user.tokenVersion + 1);
check('a MARKED_DEAD call log was written', marked.json.callLog?.outcome === 'MARKED_DEAD');

const deadUser = await prisma.user.findUnique({ where: { id: victim.userId }, include: { donorProfile: true } });
check('availability was switched off', deadUser.donorProfile.isAvailable === false);

const audit = await prisma.auditLog.findFirst({ where: { targetUserId: victim.userId, action: 'DONOR_MARKED_DEAD' } });
check('an audit row records the action and the note', Boolean(audit) && audit.note?.startsWith('Number rings out'));
check('the audit row remembers the previous availability', audit?.metadata?.wasAvailable === true);

// --- the consequences, verified rather than assumed ---

const rejected = await api('GET', '/me', null, donorToken);
check(
  'the donor\'s existing access token is now rejected',
  rejected.status === 401 && rejected.json.error?.code === 'TOKEN_VERSION_MISMATCH',
  `got ${rejected.status} ${rejected.json.error?.code}`,
);

const refreshed = await api('POST', '/auth/refresh', { refreshToken: donorAuth.refreshToken });
check('the donor cannot refresh their way back in', refreshed.status === 401, `got ${refreshed.status}`);

const searchAfterDeath = await api(
  'GET',
  `/donors/search?bloodGroup=${victim.bloodGroup}&district=Khordha&pageSize=100`,
  null,
  receiverToken,
);
check(
  'the donor no longer appears in search',
  !searchAfterDeath.json.results.some((row) => row.userId === victim.userId),
);

const secondMark = await api('POST', `/crm/donors/${victim.userId}/mark-dead`, {}, staffToken);
check('marking an already dead donor is a conflict, not a second token bump', secondMark.status === 409, `got ${secondMark.status}`);

const stillDead = await prisma.user.findUnique({ where: { id: victim.userId } });
check('the token version did not move again', stillDead.tokenVersion === victim.user.tokenVersion + 1);

// ---- 7. the way back: OTP re-login --------------------------------------------

const reLogin = await loginByOtp(victim.user.phone, 'DONOR');
check('re-verifying by OTP flips the donor back to ACTIVE', reLogin.user?.status === 'ACTIVE', reLogin.error?.message);
check('the response says they were reactivated', reLogin.reactivated === true);

const meAfter = await api('GET', '/me', null, reLogin.accessToken);
check('the new token works', meAfter.status === 200, meAfter.json.error?.message);

// Availability stays off until the donor turns it back on themselves — re-login proves the
// number reaches them, not that they are free to donate.
const afterRelogin = await prisma.donorProfile.findUnique({ where: { userId: victim.userId } });
check('availability is left for the donor to switch back on', afterRelogin.isAvailable === false);

await api('PATCH', '/donors/me/availability', { isAvailable: true }, reLogin.accessToken);
const searchAfterRelogin = await api(
  'GET',
  `/donors/search?bloodGroup=${victim.bloodGroup}&district=Khordha&pageSize=100`,
  null,
  receiverToken,
);
check(
  'once available again, the donor is back in search',
  searchAfterRelogin.json.results.some((row) => row.userId === victim.userId),
);

// ---- 8. the admin override ----------------------------------------------------

// Put them back to DEAD so reactivate has something to undo.
await api('POST', `/crm/donors/${victim.userId}/mark-dead`, { note: 'Second pass for the admin override check.' }, staffToken);

const reactivated = await api(
  'POST',
  `/crm/donors/${victim.userId}/reactivate`,
  { note: 'Wrong number in our records, corrected.' },
  adminToken,
);
check('ADMIN can reactivate', reactivated.status === 200 && reactivated.json.user?.status === 'ACTIVE', reactivated.json.error?.message);
check(
  'reactivation restores the availability the donor had before',
  reactivated.json.effects?.isAvailable === true,
);
check('reactivation does not restore the old session', reactivated.json.effects?.sessionsInvalidated === true);

const reactivateAgain = await api('POST', `/crm/donors/${victim.userId}/reactivate`, {}, adminToken);
check('reactivating an active donor is a conflict', reactivateAgain.status === 409, `got ${reactivateAgain.status}`);

const auditTrail = await prisma.auditLog.findMany({ where: { targetUserId: victim.userId }, orderBy: { createdAt: 'asc' } });
check('the audit trail has both actions', auditTrail.length === 3 && auditTrail.at(-1).action === 'DONOR_REACTIVATED', `${auditTrail.length} rows`);

const staffAccount = await prisma.user.findUnique({ where: { email: STAFF_EMAIL } });
const markStaff = await api('POST', `/crm/donors/${staffAccount.id}/mark-dead`, {}, staffToken);
check('a staff account cannot be marked unreachable', markStaff.status === 400, `got ${markStaff.status}`);

// ---- done ---------------------------------------------------------------------

await cleanup();
await prisma.$disconnect();

console.log(`\n${failures ? `${failures} check(s) failed` : 'All checks passed'}`);
process.exit(failures ? 1 : 0);
