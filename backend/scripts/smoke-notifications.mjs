/**
 * End-to-end smoke test for the Phase 5 device + notification APIs.
 *
 *   Terminal 1:  npm run dev
 *   Terminal 2:  npm run db:seed      (once — the checks lean on the Odisha donors)
 *   Terminal 3:  npm run smoke:notifications
 *
 * Requires SMS_PROVIDER=console (it reads the OTP from the `devCode` field) and works
 * with PUSH_PROVIDER=console, which prints each notification to the API's log instead of
 * sending it — no device needed. What is verified here is everything up to the wire:
 * inbox rows, deep-link payloads, notifiedAt stamping, read state and token lifecycle.
 * Actual delivery to a phone needs a dev build (see docs/notifications.md).
 *
 * Creates one throwaway receiver, one blood request and one device token, and deletes all
 * three on the way out. Seeded donors are logged in as and notified; their notifications
 * are cleaned up too.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (process.env.NODE_ENV === 'production') {
  throw new Error('smoke-notifications.mjs writes test data. Refusing to run with NODE_ENV=production.');
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

const RECEIVER_PHONE = '+919876500051';
// Shaped like a real Expo token so the check survives a switch to PUSH_PROVIDER=expo.
const DEVICE_TOKEN = 'ExponentPushToken[smoke-test-device-0001]';
const SECOND_DEVICE_TOKEN = 'ExponentPushToken[smoke-test-device-0002]';

let notifiedDonorIds = [];

async function cleanup() {
  const receiver = await prisma.user.findUnique({ where: { phone: RECEIVER_PHONE } });
  if (receiver) {
    // Matches and notifications cascade from the request and the users respectively.
    await prisma.bloodRequest.deleteMany({ where: { requesterId: receiver.id } });
    await prisma.notification.deleteMany({ where: { userId: receiver.id } });
    await prisma.user.delete({ where: { id: receiver.id } });
  }
  if (notifiedDonorIds.length) {
    await prisma.notification.deleteMany({ where: { userId: { in: notifiedDonorIds } } });
  }
  await prisma.deviceToken.deleteMany({
    where: { expoPushToken: { in: [DEVICE_TOKEN, SECOND_DEVICE_TOKEN] } },
  });
  await prisma.otpCode.deleteMany({ where: { phone: RECEIVER_PHONE } });
}

await cleanup();

const donorCount = await prisma.donorProfile.count();
if (donorCount < 10) {
  console.error('Seed the database first: npm run db:seed --workspace backend');
  process.exit(1);
}

// ---- 0. sign in as a nearby donor and as a receiver --------------------------

// A Khordha donor with coordinates, so the request below matches them by radius.
const donorProfile = await prisma.donorProfile.findFirst({
  where: {
    district: { equals: 'Khordha', mode: 'insensitive' },
    isAvailable: true,
    latitude: { not: null },
    user: { status: 'ACTIVE' },
  },
  include: { user: true },
});

if (!donorProfile) {
  console.error('No seeded Khordha donor with coordinates found. Re-run npm run db:seed.');
  process.exit(1);
}

// Ask for this donor's own group rather than a fixed one: a donor of group X can always
// donate to group X, so the check works whatever the seed happens to have scattered
// around Bhubaneswar.
const REQUEST_GROUP = donorProfile.bloodGroup;
const { bloodGroupLabel } = await import('../src/services/matching.js');

const donorAuth = await loginByOtp(donorProfile.user.phone, 'DONOR');
const donorToken = donorAuth.accessToken;
check('OTP login as a seeded donor', Boolean(donorToken), donorAuth.error?.message);

const receiverAuth = await loginByOtp(RECEIVER_PHONE, 'RECEIVER');
const receiverToken = receiverAuth.accessToken;
check('OTP login as a receiver', Boolean(receiverToken));

await api(
  'POST',
  '/receivers/register',
  { fullName: 'Smoke Notify', state: 'Odisha', district: 'Khordha', city: 'Bhubaneswar', ...BHUBANESWAR },
  receiverToken,
);

// ---- 1. device registration --------------------------------------------------
const registered = await api(
  'POST',
  '/devices/register',
  { expoPushToken: DEVICE_TOKEN, platform: 'android' },
  donorToken,
);
check('device registers', registered.status === 201 && registered.json.created === true, registered.json.error?.message);

const reRegistered = await api(
  'POST',
  '/devices/register',
  { expoPushToken: DEVICE_TOKEN, platform: 'android' },
  donorToken,
);
check(
  're-registering the same token is idempotent',
  reRegistered.status === 200 && reRegistered.json.created === false,
  reRegistered.json.error?.message,
);

const badPlatform = await api(
  'POST',
  '/devices/register',
  { expoPushToken: SECOND_DEVICE_TOKEN, platform: 'symbian' },
  donorToken,
);
check('an unknown platform is rejected with a field message', badPlatform.status === 400 && Boolean(badPlatform.json.error?.fields?.platform));

const anonymous = await api('POST', '/devices/register', { expoPushToken: SECOND_DEVICE_TOKEN, platform: 'ios' });
check('device registration needs a token', anonymous.status === 401);

// A phone the receiver later signs into: the same push token must follow the account.
const reassigned = await api(
  'POST',
  '/devices/register',
  { expoPushToken: SECOND_DEVICE_TOKEN, platform: 'ios' },
  donorToken,
);
const stolen = await api(
  'POST',
  '/devices/register',
  { expoPushToken: SECOND_DEVICE_TOKEN, platform: 'ios' },
  receiverToken,
);
check(
  'a shared handset re-points to whoever signed in last',
  reassigned.status === 201 && stolen.status === 200 && stolen.json.reassigned === true,
  stolen.json.error?.message,
);

const devices = await api('GET', '/devices', null, donorToken);
check('the donor keeps only their own device', devices.json.total === 1, `total ${devices.json.total}`);

// ---- 2. a request notifies the matched donors --------------------------------
const before = await api('GET', '/notifications', null, donorToken);
const unreadBefore = before.json.unreadCount ?? 0;

const created = await api(
  'POST',
  '/requests',
  {
    bloodGroup: REQUEST_GROUP,
    unitsNeeded: 2,
    hospitalName: 'Apollo Hospital',
    contactPhone: '+919876500051',
    urgency: 'URGENT',
    state: 'Odisha',
    district: 'Khordha',
    city: 'Bhubaneswar',
    ...BHUBANESWAR,
  },
  receiverToken,
);
check('request created', created.status === 201, created.json.error?.message);

const requestId = created.json.request?.id;
const matching = created.json.matching ?? {};
check('the response reports how many donors were notified', typeof matching.notification?.notified === 'number', JSON.stringify(matching.notification));
check(
  'every matched donor was notified',
  matching.notification?.notified === matching.matchedCount,
  `${matching.notification?.notified} of ${matching.matchedCount}`,
);
check(
  'the donor with a registered device was reached',
  matching.notification?.sent >= 1,
  `sent ${matching.notification?.sent}, no device for ${matching.notification?.recipientsWithoutDevice}`,
);

notifiedDonorIds = (
  await prisma.requestMatch.findMany({ where: { requestId }, select: { donorUserId: true } })
).map((row) => row.donorUserId);

const unnotified = await prisma.requestMatch.count({ where: { requestId, notifiedAt: null } });
check('notifiedAt is stamped on every match', unnotified === 0, `${unnotified} still null`);

// ---- 3. the in-app inbox -----------------------------------------------------
const inbox = await api('GET', '/notifications', null, donorToken);
check('inbox lists the new notification', inbox.status === 200 && inbox.json.total > before.json.total);
check('unread count went up', inbox.json.unreadCount === unreadBefore + 1, `${unreadBefore} -> ${inbox.json.unreadCount}`);

const latest = inbox.json.results[0];
check('newest first', latest?.data?.requestId === requestId, latest?.title);
check(
  'the title is spoken, not shouted',
  latest?.title === `Urgent: ${bloodGroupLabel(REQUEST_GROUP)} blood needed nearby`,
  latest?.title,
);
check('the body carries the hospital and the distance', /Apollo Hospital.*kilometre/.test(latest?.body ?? ''), latest?.body);
check(
  'the payload can deep-link to the respond screen',
  Boolean(latest?.data?.matchId) && latest?.data?.screen === 'request-detail',
  JSON.stringify(latest?.data),
);
check('a new notification starts unread', latest?.isRead === false && latest?.readAt === null);

const unreadOnly = await api('GET', '/notifications?unreadOnly=true', null, donorToken);
check('unreadOnly filters', unreadOnly.json.results.every((n) => n.isRead === false));

// ---- 4. read state -----------------------------------------------------------
const read = await api('PATCH', `/notifications/${latest.id}/read`, null, donorToken);
check('marking read works', read.status === 200 && read.json.notification.isRead === true, read.json.error?.message);
check('unread count came back down', read.json.unreadCount === unreadBefore, `${read.json.unreadCount}`);

const readAgain = await api('PATCH', `/notifications/${latest.id}/read`, null, donorToken);
check(
  'marking read twice keeps the original timestamp',
  readAgain.json.notification.readAt === read.json.notification.readAt,
);

const otherUsersRead = await api('PATCH', `/notifications/${latest.id}/read`, null, receiverToken);
check(
  "another user cannot read someone else's notification, or probe for its id",
  otherUsersRead.status === 404 && otherUsersRead.json.error?.code === 'NOTIFICATION_NOT_FOUND',
  `status ${otherUsersRead.status}`,
);

// ---- 5. accepting tells the requester ----------------------------------------
const responded = await api(
  'POST',
  `/requests/${requestId}/matches/${donorProfile.userId}/respond`,
  { response: 'ACCEPTED' },
  donorToken,
);
check('donor accepts', responded.status === 200, responded.json.error?.message);

const requesterInbox = await api('GET', '/notifications', null, receiverToken);
const acceptance = requesterInbox.json.results?.[0];
check(
  'the requester is told who accepted, by name',
  acceptance?.type === 'BLOOD_REQUEST_ACCEPTED' && acceptance.title.includes(donorProfile.user.name),
  acceptance?.title,
);

// ---- 6. re-matching never re-notifies ----------------------------------------
const notificationsBeforeRematch = await prisma.notification.count({
  where: { userId: { in: notifiedDonorIds }, data: { path: ['requestId'], equals: requestId } },
});
const requestRow = await prisma.bloodRequest.findUnique({ where: { id: requestId } });
const { createMatchesForRequest } = await import('../src/services/matchingEngine.js');
await createMatchesForRequest(requestRow);
const notificationsAfterRematch = await prisma.notification.count({
  where: { userId: { in: notifiedDonorIds }, data: { path: ['requestId'], equals: requestId } },
});
check(
  're-running the matcher does not notify anyone twice',
  notificationsAfterRematch === notificationsBeforeRematch,
  `${notificationsBeforeRematch} -> ${notificationsAfterRematch}`,
);

// ---- 7. unregistering on logout ----------------------------------------------
const removed = await api('DELETE', `/devices/${encodeURIComponent(DEVICE_TOKEN)}`, null, donorToken);
check('device unregisters', removed.status === 200 && removed.json.removed === true, removed.json.error?.message);

const removedAgain = await api('DELETE', `/devices/${encodeURIComponent(DEVICE_TOKEN)}`, null, donorToken);
check('unregistering twice is not an error', removedAgain.status === 200 && removedAgain.json.removed === false);

const notMine = await api('DELETE', `/devices/${encodeURIComponent(SECOND_DEVICE_TOKEN)}`, null, donorToken);
check("a user cannot unregister someone else's device", notMine.status === 403, `status ${notMine.status}`);

// ---- done ---------------------------------------------------------------------
await cleanup();
await prisma.$disconnect();

console.log(`\n${failures ? `${failures} check(s) failed` : 'All checks passed'}`);
process.exit(failures ? 1 : 0);
