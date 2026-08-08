import { afterAll, beforeAll, beforeEach, describe, expect, test } from '@jest/globals';
import request from 'supertest';
import { prisma } from '../../src/config/prisma.js';
import {
  app,
  createStaff,
  disconnect,
  loginByOtp,
  loginStaff,
  resetFixtures,
  testPhone,
} from './helpers.js';

/**
 * The dead-donor lifecycle, driven the way it actually happens:
 *
 *   a donor signs in on the app  ->  staff cannot reach them and press "Mark as unreachable"
 *   ->  the donor's phone gets a 401 on its very next request  ->  the donor re-verifies by
 *   OTP  ->  they are ACTIVE again and back in search.
 *
 * This is the one behaviour in Red Express that no single module owns. mark-dead is in
 * donorLifecycleService, the 401 comes from middleware/auth.js comparing a JWT claim against
 * a database column, disappearing from search is a WHERE clause in donorSearchService, and
 * the way back is in authService's OTP verify. A unit test of any one of them would pass
 * while the loop was broken; only an integration test can say the four agree.
 *
 * The mechanism is documented in backend/docs/auth.md and backend/docs/crm-lifecycle.md.
 */

const DONOR_PHONE = testPhone(20);
const SEARCHER_PHONE = testPhone(21);

let staff;
let staffToken;
let admin;
let adminToken;

beforeAll(async () => {
  await resetFixtures();
});

afterAll(async () => {
  await resetFixtures();
  await disconnect();
});

beforeEach(async () => {
  await resetFixtures();

  staff = await createStaff({ role: 'STAFF' });
  admin = await createStaff({ role: 'ADMIN' });

  staffToken = (await loginStaff(request, staff.email, staff.password)).accessToken;
  adminToken = (await loginStaff(request, admin.email, admin.password)).accessToken;
});

/** Signs a donor in over OTP and gives them a complete, searchable profile. */
async function signInDonor(phone = DONOR_PHONE, { name = 'Ravi Patnaik' } = {}) {
  const session = await loginByOtp(request, phone, 'DONOR');

  await prisma.donorProfile.create({
    data: {
      userId: session.user.id,
      bloodGroup: 'O_POS',
      gender: 'MALE',
      dateOfBirth: new Date('1994-02-11'),
      isAvailable: true,
      state: 'Odisha',
      district: 'Khordha',
      city: 'Bhubaneswar',
      pincode: '751001',
      address: '12 Test Lane, Bhubaneswar',
      latitude: 20.2961,
      longitude: 85.8245,
    },
  });
  await prisma.user.update({ where: { id: session.user.id }, data: { name } });

  return session;
}

function markDead(token, userId, body = {}) {
  return request(app)
    .post(`/crm/donors/${userId}/mark-dead`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
}

describe('mark dead -> forced logout -> OTP re-login -> active', () => {
  test('the whole loop', async () => {
    // --- the donor is signed in and visible -------------------------------
    const donor = await signInDonor();

    const before = await request(app).get('/me').set('Authorization', `Bearer ${donor.accessToken}`);
    expect(before.status).toBe(200);

    // Someone else searching finds them.
    const searcher = await loginByOtp(request, SEARCHER_PHONE, 'RECEIVER');
    const foundBefore = await request(app)
      .get('/donors/search')
      .query({ bloodGroup: 'O_POS', district: 'Khordha' })
      .set('Authorization', `Bearer ${searcher.accessToken}`);

    expect(foundBefore.status).toBe(200);
    expect(foundBefore.body.results.map((row) => row.userId)).toContain(donor.user.id);

    // --- staff mark them unreachable --------------------------------------
    const marked = await markDead(staffToken, donor.user.id, { note: 'Three attempts, number not in service.' });

    expect(marked.status).toBe(200);
    expect(marked.body.user.status).toBe('DEAD');
    expect(marked.body.effects).toMatchObject({
      removedFromSearch: true,
      sessionsInvalidated: true,
      recoverableBy: 'OTP_RE_LOGIN',
    });

    const row = await prisma.user.findUnique({
      where: { id: donor.user.id },
      include: { donorProfile: true },
    });
    expect(row.status).toBe('DEAD');
    // The bump is the forced logout. Without it the donor stays signed in and invisible,
    // which is the worst of both.
    expect(row.tokenVersion).toBe(1);
    expect(row.donorProfile.isAvailable).toBe(false);

    // Both halves of the trail exist, and both are in the same transaction as the change.
    const callLog = await prisma.callLog.findFirst({
      where: { donorUserId: donor.user.id, outcome: 'MARKED_DEAD' },
    });
    expect(callLog).not.toBeNull();
    expect(callLog.staffId).toBe(staff.user.id);
    expect(callLog.note).toContain('not in service');

    const audit = await prisma.auditLog.findFirst({
      where: { targetUserId: donor.user.id, action: 'DONOR_MARKED_DEAD' },
    });
    expect(audit).not.toBeNull();
    expect(audit.actorId).toBe(staff.user.id);
    expect(audit.metadata).toMatchObject({ previousStatus: 'ACTIVE', newTokenVersion: 1, wasAvailable: true });

    // --- the donor's phone is signed out on its next request --------------
    const after = await request(app).get('/me').set('Authorization', `Bearer ${donor.accessToken}`);

    expect(after.status).toBe(401);
    // The app's interceptor switches on exactly this code — see mobile/services/apiClient.js.
    expect(after.body.error.code).toBe('TOKEN_VERSION_MISMATCH');

    // And the refresh token is no way around it: it carries the same stale version.
    const refreshed = await request(app).post('/auth/refresh').send({ refreshToken: donor.refreshToken });
    expect(refreshed.status).toBe(401);
    expect(refreshed.body.error.code).toBe('TOKEN_VERSION_MISMATCH');

    // --- they are gone from search and from matching ----------------------
    const foundAfter = await request(app)
      .get('/donors/search')
      .query({ bloodGroup: 'O_POS', district: 'Khordha' })
      .set('Authorization', `Bearer ${searcher.accessToken}`);

    expect(foundAfter.body.results.map((r) => r.userId)).not.toContain(donor.user.id);

    // A request that would have matched them notifies nobody at this address.
    const posted = await request(app)
      .post('/requests')
      .set('Authorization', `Bearer ${searcher.accessToken}`)
      .send({
        bloodGroup: 'O_POS',
        unitsNeeded: 2,
        hospitalName: 'AIIMS Bhubaneswar',
        contactPhone: SEARCHER_PHONE,
        urgency: 'URGENT',
        latitude: 20.2961,
        longitude: 85.8245,
        state: 'Odisha',
        district: 'Khordha',
        city: 'Bhubaneswar',
      });

    expect(posted.status).toBe(201);
    const matchedIds = await prisma.requestMatch.findMany({
      where: { requestId: posted.body.request.id },
      select: { donorUserId: true },
    });
    expect(matchedIds.map((m) => m.donorUserId)).not.toContain(donor.user.id);

    // --- the donor re-opens the app and passes an OTP ---------------------
    const revived = await loginByOtp(request, DONOR_PHONE, 'DONOR');

    expect(revived.user.status).toBe('ACTIVE');
    expect(revived.reactivated).toBe(true);

    // The new token works; the old one still does not, because the version moved once and
    // re-login does not move it back.
    expect((await request(app).get('/me').set('Authorization', `Bearer ${revived.accessToken}`)).status).toBe(200);
    expect((await request(app).get('/me').set('Authorization', `Bearer ${donor.accessToken}`)).status).toBe(401);

    // Availability is deliberately NOT restored: proving the number reaches them is not
    // proving they are free to donate. See docs/crm-lifecycle.md.
    const back = await prisma.user.findUnique({
      where: { id: donor.user.id },
      include: { donorProfile: true },
    });
    expect(back.status).toBe('ACTIVE');
    expect(back.donorProfile.isAvailable).toBe(false);

    // Which means they are still out of an availableOnly search until they say otherwise,
    // and back in one that includes unavailable donors.
    const stillHidden = await request(app)
      .get('/donors/search')
      .query({ bloodGroup: 'O_POS', district: 'Khordha' })
      .set('Authorization', `Bearer ${searcher.accessToken}`);
    expect(stillHidden.body.results.map((r) => r.userId)).not.toContain(donor.user.id);

    const turnedOn = await request(app)
      .patch('/donors/me/availability')
      .set('Authorization', `Bearer ${revived.accessToken}`)
      .send({ isAvailable: true });
    expect(turnedOn.status).toBe(200);

    const foundAgain = await request(app)
      .get('/donors/search')
      .query({ bloodGroup: 'O_POS', district: 'Khordha' })
      .set('Authorization', `Bearer ${searcher.accessToken}`);
    expect(foundAgain.body.results.map((r) => r.userId)).toContain(donor.user.id);
  });
});

describe('who may do what', () => {
  test('an app user cannot reach the CRM at all', async () => {
    const donor = await signInDonor();

    const response = await markDead(donor.accessToken, donor.user.id);

    expect(response.status).toBe(403);
  });

  test('an unauthenticated caller cannot reach the CRM', async () => {
    const donor = await signInDonor();

    expect((await request(app).post(`/crm/donors/${donor.user.id}/mark-dead`).send({})).status).toBe(401);
  });

  test('STAFF may mark dead but may not reactivate', async () => {
    const donor = await signInDonor();

    expect((await markDead(staffToken, donor.user.id)).status).toBe(200);

    const attempt = await request(app)
      .post(`/crm/donors/${donor.user.id}/reactivate`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({});

    // "I could not reach this person" is a report from the phones; "this person is fine
    // actually" overrules one, so only an administrator may do it.
    expect(attempt.status).toBe(403);
    expect(await prisma.user.findUnique({ where: { id: donor.user.id } })).toMatchObject({ status: 'DEAD' });
  });

  test('ADMIN reactivation restores search but never the old session', async () => {
    const donor = await signInDonor();
    await markDead(staffToken, donor.user.id);

    const response = await request(app)
      .post(`/crm/donors/${donor.user.id}/reactivate`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ note: 'Marked in error — reached them on the ward line.' });

    expect(response.status).toBe(200);
    expect(response.body.user.status).toBe('ACTIVE');
    // The tokenVersion bump is not rolled back: reactivating must not hand a working
    // session to whoever is holding that phone now.
    expect(response.body.effects.sessionsInvalidated).toBe(true);
    expect((await request(app).get('/me').set('Authorization', `Bearer ${donor.accessToken}`)).status).toBe(401);

    const audit = await prisma.auditLog.findFirst({
      where: { targetUserId: donor.user.id, action: 'DONOR_REACTIVATED' },
    });
    expect(audit.actorId).toBe(admin.user.id);
    expect(audit.note).toContain('Marked in error');
  });

  test('a staff account cannot be marked unreachable from the call worklist', async () => {
    const other = await createStaff({ role: 'STAFF' });

    const response = await markDead(staffToken, other.user.id);

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('NOT_AN_APP_USER');
  });

  test('marking an already-dead donor is a conflict, not a second token bump', async () => {
    const donor = await signInDonor();
    await markDead(staffToken, donor.user.id);

    const again = await markDead(staffToken, donor.user.id);

    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_DEAD');
    expect((await prisma.user.findUnique({ where: { id: donor.user.id } })).tokenVersion).toBe(1);
  });
});
