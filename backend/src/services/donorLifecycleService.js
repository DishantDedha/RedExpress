import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/errors.js';
import { publicUser } from './authService.js';
import { callLogView, listCalls } from './callLogService.js';
import { AUDIT_ACTIONS, recordAudit } from './auditService.js';

/**
 * The ACTIVE -> DEAD -> (re-login) -> ACTIVE loop.
 *
 * "Dead" means unreachable, not deceased. A staff member has rung a donor's number enough
 * times to conclude it no longer reaches them, so the account is taken out of circulation
 * until the person proves otherwise by opening the app and passing an OTP. Three things
 * have to happen together for that to be true:
 *
 *   1. status = DEAD          — donorBaseWhere filters on ACTIVE, so they leave search
 *                               and, because matching reuses that filter, stop being
 *                               notified.
 *   2. tokenVersion + 1       — requireAuth compares the JWT claim against this column,
 *                               so every token they hold dies on their next request. This
 *                               is the forced logout; see docs/auth.md.
 *   3. isAvailable = false    — belt and braces, and it is what the donor sees on their
 *                               own profile when they come back.
 *
 * Coming back is entirely the donor's own doing: completePhoneLogin flips DEAD -> ACTIVE
 * on a successful OTP verify (authService). Nothing in this file is needed for the return
 * trip — reactivate below is the manual override for when staff got it wrong, not the
 * normal path. The whole loop is written out in docs/crm-lifecycle.md.
 */

/** Staff accounts are managed by an administrator, not by the call worklist. */
function assertAppUser(user) {
  if (user.role === 'STAFF' || user.role === 'ADMIN') {
    throw ApiError.badRequest(
      'NOT_AN_APP_USER',
      'Staff accounts cannot be marked unreachable. Ask an administrator to disable the account instead.',
    );
  }
}

async function loadTarget(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { donorProfile: true } });
  if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'That person is no longer in Red Express.');
  return user;
}

// ---------------------------------------------------------------------------
// Mark dead
// ---------------------------------------------------------------------------

/**
 * Takes an unreachable donor out of circulation and invalidates their sessions.
 *
 * All four writes run in one interactive transaction. A status change that lands without
 * its tokenVersion bump would leave a donor invisible in search but still logged in and
 * still holding a valid token — the exact half-state this feature exists to avoid.
 *
 * Available to STAFF and ADMIN. Undoing it is ADMIN-only (reactivateUser below), because
 * the two decisions carry different weight: "I could not reach this person" is a report
 * from the phones, "this person is fine actually" overrules one.
 */
export async function markUserDead(staff, userId, { note, requestId } = {}) {
  const user = await loadTarget(userId);
  assertAppUser(user);

  if (user.status === 'DEAD') {
    throw ApiError.conflict('ALREADY_DEAD', `${user.name || 'This donor'} is already marked unreachable.`);
  }
  if (user.status === 'BLOCKED') {
    throw ApiError.conflict('ACCOUNT_BLOCKED', 'This account is blocked. Marking it unreachable would change nothing.');
  }

  if (requestId) {
    const exists = await prisma.bloodRequest.findUnique({ where: { id: requestId }, select: { id: true } });
    if (!exists) throw ApiError.notFound('REQUEST_NOT_FOUND', 'That blood request no longer exists.');
  }

  const wasAvailable = user.donorProfile?.isAvailable ?? null;

  const { updated, callLog } = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      // increment rather than a read-then-write: two staff marking the same donor at the
      // same moment must not both write tokenVersion 1.
      data: { status: 'DEAD', tokenVersion: { increment: 1 } },
    });

    // updateMany, not update — a RECEIVER has no DonorProfile and update would throw.
    await tx.donorProfile.updateMany({ where: { userId }, data: { isAvailable: false } });

    const callLog = await tx.callLog.create({
      data: {
        staffId: staff.id,
        donorUserId: userId,
        requestId: requestId ?? null,
        outcome: 'MARKED_DEAD',
        note: note ?? null,
      },
      include: { staff: { select: { name: true } } },
    });

    await recordAudit(tx, {
      actorId: staff.id,
      action: AUDIT_ACTIONS.DONOR_MARKED_DEAD,
      targetUserId: userId,
      note,
      metadata: {
        previousStatus: user.status,
        previousTokenVersion: user.tokenVersion,
        newTokenVersion: updated.tokenVersion,
        // Remembered so reactivation can put the donor's own availability choice back
        // rather than assuming they were available before we switched them off.
        wasAvailable,
        requestId: requestId ?? null,
      },
    });

    return { updated, callLog };
  });

  return {
    user: publicUser(updated),
    callLog: callLogView(callLog),
    // What actually changed, so the CRM can say it out loud instead of implying it with a
    // colour change on a badge.
    effects: {
      removedFromSearch: true,
      removedFromNotifications: true,
      sessionsInvalidated: true,
      tokenVersion: updated.tokenVersion,
      recoverableBy: 'OTP_RE_LOGIN',
    },
    history: await listCalls({ donorUserId: userId }),
    message: `${updated.name || 'This donor'} is marked unreachable. They will not appear in search or receive alerts until they sign in again.`,
  };
}

// ---------------------------------------------------------------------------
// Reactivate
// ---------------------------------------------------------------------------

/** The availability the donor had before staff switched them off, if we know it. */
async function availabilityBeforeDeath(userId) {
  const audit = await prisma.auditLog.findFirst({
    where: { targetUserId: userId, action: AUDIT_ACTIONS.DONOR_MARKED_DEAD },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  });

  const remembered = audit?.metadata?.wasAvailable;
  // Only a recorded `false` should keep them switched off. Missing history (marked dead
  // before this was tracked, or blocked by hand) defaults to available — a donor who is
  // back should be reachable.
  return remembered === false ? false : true;
}

/**
 * ADMIN-only override, for when a donor was marked unreachable in error.
 *
 * Note what this does NOT do: it does not restore anyone's session. The tokenVersion bump
 * from mark-dead is not rolled back, so a donor whose account is reactivated still signs
 * in again the next time they open the app — they simply are not blocked from search in
 * the meantime. Rolling it back would mean handing a working session to whoever last held
 * that phone, which is the thing the bump was protecting against.
 */
export async function reactivateUser(admin, userId, { note } = {}) {
  const user = await loadTarget(userId);
  assertAppUser(user);

  if (user.status === 'ACTIVE') {
    throw ApiError.conflict('ALREADY_ACTIVE', `${user.name || 'This donor'} is already active.`);
  }

  const restoreAvailability = await availabilityBeforeDeath(userId);

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: userId }, data: { status: 'ACTIVE' } });

    await tx.donorProfile.updateMany({ where: { userId }, data: { isAvailable: restoreAvailability } });

    await recordAudit(tx, {
      actorId: admin.id,
      action: AUDIT_ACTIONS.DONOR_REACTIVATED,
      targetUserId: userId,
      note,
      metadata: {
        previousStatus: user.status,
        restoredAvailability: restoreAvailability,
        // Unchanged on purpose — recorded so the trail shows the session was not restored.
        tokenVersion: user.tokenVersion,
      },
    });

    return updated;
  });

  return {
    user: publicUser(updated),
    effects: {
      restoredToSearch: true,
      isAvailable: restoreAvailability,
      sessionsInvalidated: true,
      tokenVersion: updated.tokenVersion,
    },
    message: `${updated.name || 'This donor'} is active again. They still need to sign in on the app, because their old session was ended when they were marked unreachable.`,
  };
}
