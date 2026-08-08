/**
 * End-to-end smoke test for the Phase 2 auth system.
 *
 *   Terminal 1:  npm run dev
 *   Terminal 2:  npm run smoke:auth
 *
 * Requires SMS_PROVIDER=console (the script reads the OTP from the `devCode` field the
 * console provider returns). It creates, mutates and deletes a throwaway test user and
 * temporarily gives staff1 a phone number, so it refuses to run against production.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

if (process.env.NODE_ENV === 'production') {
  throw new Error('smoke-auth.mjs writes test data. Refusing to run with NODE_ENV=production.');
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
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, json: await res.json().catch(() => ({})) };
}

const PHONE = '9876500022';
const E164 = '+919876500022';

// Clean slate for this test number.
await prisma.otpCode.deleteMany({ where: { phone: E164 } });
await prisma.user.deleteMany({ where: { phone: E164 } });

// ---- 1. OTP login -----------------------------------------------------------
const req1 = await api('POST', '/auth/otp/request', { phone: PHONE });
check('otp/request returns 200 + devCode', req1.status === 200 && !!req1.json.devCode);

const ver1 = await api('POST', '/auth/otp/verify', { phone: PHONE, code: req1.json.devCode, role: 'DONOR' });
check('otp/verify creates DONOR', ver1.status === 200 && ver1.json.user.role === 'DONOR' && ver1.json.isNewUser);
const { accessToken, refreshToken } = ver1.json;
const userId = ver1.json.user.id;

// ---- 2. requireAuth ---------------------------------------------------------
const sess = await api('GET', '/auth/session', null, accessToken);
check('session accepts access token', sess.status === 200 && sess.json.user.id === userId);

const wrongTyp = await api('GET', '/auth/session', null, refreshToken);
check('refresh token rejected at /auth/session', wrongTyp.status === 401 && wrongTyp.json.error.code === 'INVALID_TOKEN');

const garbage = await api('GET', '/auth/session', null, 'not.a.token');
check('garbage token rejected', garbage.status === 401);

// ---- 3. refresh -------------------------------------------------------------
const ref = await api('POST', '/auth/refresh', { refreshToken });
check('refresh issues new access token', ref.status === 200 && typeof ref.json.accessToken === 'string');
const refreshedAccess = ref.json.accessToken;
check('refreshed token works', (await api('GET', '/auth/session', null, refreshedAccess)).status === 200);

// ---- 4. mark-dead simulation: tokenVersion bump forces logout ---------------
// This is what POST /crm/donors/:id/mark-dead will do in Phase 6.
await prisma.user.update({
  where: { id: userId },
  data: { status: 'DEAD', tokenVersion: { increment: 1 } },
});

const afterDead = await api('GET', '/auth/session', null, accessToken);
check(
  'old access token rejected after tokenVersion bump',
  afterDead.status === 401 && afterDead.json.error.code === 'TOKEN_VERSION_MISMATCH',
  afterDead.json.error?.code,
);

const refreshAfterDead = await api('POST', '/auth/refresh', { refreshToken });
check(
  'refresh token also rejected after bump',
  refreshAfterDead.status === 401 && refreshAfterDead.json.error.code === 'TOKEN_VERSION_MISMATCH',
  refreshAfterDead.json.error?.code,
);

// ---- 5. re-login by OTP revives a DEAD donor --------------------------------
await prisma.otpCode.deleteMany({ where: { phone: E164 } }); // reset the rate-limit window
const req2 = await api('POST', '/auth/otp/request', { phone: PHONE });
const ver2 = await api('POST', '/auth/otp/verify', { phone: PHONE, code: req2.json.devCode, role: 'DONOR' });
check('re-login flips DEAD -> ACTIVE', ver2.status === 200 && ver2.json.user.status === 'ACTIVE' && ver2.json.reactivated);
check('re-login keeps existing role, not a new user', ver2.json.user.role === 'DONOR' && ver2.json.isNewUser === false);

const revived = await prisma.user.findUnique({ where: { id: userId } });
check('tokenVersion NOT bumped by re-login', revived.tokenVersion === 1, `tokenVersion=${revived.tokenVersion}`);
check('new token works after revival', (await api('GET', '/auth/session', null, ver2.json.accessToken)).status === 200);

// ---- 6. BLOCKED users -------------------------------------------------------
await prisma.user.update({ where: { id: userId }, data: { status: 'BLOCKED' } });
const blockedSession = await api('GET', '/auth/session', null, ver2.json.accessToken);
check('BLOCKED user rejected by requireAuth', blockedSession.status === 403 && blockedSession.json.error.code === 'ACCOUNT_BLOCKED');
await prisma.otpCode.deleteMany({ where: { phone: E164 } });
const blockedOtp = await api('POST', '/auth/otp/request', { phone: PHONE });
check('BLOCKED user gets no OTP', blockedOtp.status === 403 && blockedOtp.json.error.code === 'ACCOUNT_BLOCKED');
await prisma.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

// ---- 7. staff login ---------------------------------------------------------
const staffBad = await api('POST', '/auth/staff/login', { email: 'staff1@redexpress.local', password: 'wrong' });
check('staff login rejects wrong password', staffBad.status === 401 && staffBad.json.error.code === 'INVALID_CREDENTIALS');

const staffMissing = await api('POST', '/auth/staff/login', { email: 'nobody@redexpress.local', password: 'wrong' });
check('unknown email gives the same error', staffMissing.status === 401 && staffMissing.json.error.code === 'INVALID_CREDENTIALS');

const staffOk = await api('POST', '/auth/staff/login', {
  email: 'staff1@redexpress.local',
  password: process.env.SEED_STAFF_PASSWORD,
});
check('staff login succeeds', staffOk.status === 200 && staffOk.json.user.role === 'STAFF');
check('staff access token works', (await api('GET', '/auth/session', null, staffOk.json.accessToken)).status === 200);

// A staff phone number must not be able to take the OTP path.
await prisma.user.update({ where: { email: 'staff1@redexpress.local' }, data: { phone: '+919999900001' } });
await prisma.otpCode.deleteMany({ where: { phone: '+919999900001' } });
const staffOtp = await api('POST', '/auth/otp/request', { phone: '9999900001' });
const staffOtpVerify = await api('POST', '/auth/otp/verify', {
  phone: '9999900001',
  code: staffOtp.json.devCode,
  role: 'DONOR',
});
check(
  'staff cannot log in through OTP',
  staffOtpVerify.status === 403 && staffOtpVerify.json.error.code === 'STAFF_MUST_USE_PASSWORD',
  staffOtpVerify.json.error?.code,
);
await prisma.user.update({ where: { email: 'staff1@redexpress.local' }, data: { phone: null } });

// ---- 8. validation ----------------------------------------------------------
const badRole = await api('POST', '/auth/otp/verify', { phone: PHONE, code: '123456', role: 'ADMIN' });
check('role=ADMIN rejected by schema', badRole.status === 400 && !!badRole.json.error.fields.role);

const badEmail = await api('POST', '/auth/staff/login', { email: 'nope', password: 'x' });
check('invalid email shape returns fields map', badEmail.status === 400 && !!badEmail.json.error.fields.email);

// ---- cleanup ----------------------------------------------------------------
await prisma.otpCode.deleteMany({ where: { phone: { in: [E164, '+919999900001'] } } });
await prisma.user.deleteMany({ where: { phone: E164 } });
await prisma.$disconnect();

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
