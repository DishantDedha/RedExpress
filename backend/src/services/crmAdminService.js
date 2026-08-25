import { prisma } from '../config/prisma.js';
import { ApiError } from '../utils/errors.js';
import { publicUser } from './authService.js';
import { crmUserRow } from './crmService.js';
import { AUDIT_ACTIONS, recordAudit } from './auditService.js';
import { callSummariesFor } from './callLogService.js';

/**
 * The CRUD half of the CRM's people management: editing a record, suspending or
 * unsuspending an account, and deleting one outright.
 *
 * This sits apart from donorLifecycleService on purpose. Mark-dead/reactivate is the
 * ACTIVE <-> DEAD loop — a report from the phones about whether a number still reaches
 * someone, self-recoverable by the donor re-verifying. What lives here is administrative:
 * editing a record, blocking an account outright (not self-recoverable — see UserStatus in
 * schema.prisma), and permanently removing one. Different actions, different weight,
 * different audit trail entries.
 */

/** Staff accounts are managed by an administrator directly on the database, not this UI. */
function assertAppUser(user) {
  if (user.role === 'STAFF' || user.role === 'ADMIN') {
    throw ApiError.badRequest('NOT_AN_APP_USER', 'Staff accounts cannot be edited, blocked or deleted here.');
  }
}

async function loadTarget(userId) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { donorProfile: true } });
  if (!user) throw ApiError.notFound('USER_NOT_FOUND', 'That person is no longer in Red Express.');
  return user;
}

function rethrowUniqueViolation(err) {
  if (err?.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.join(',') : String(err.meta?.target ?? '');
    if (`${target} ${err.message ?? ''}`.toLowerCase().includes('email')) {
      throw ApiError.conflict('EMAIL_IN_USE', 'That email address is already registered.', {
        email: 'Already registered',
      });
    }
  }
  throw err;
}

// ---------------------------------------------------------------------------
// Edit
// ---------------------------------------------------------------------------

const USER_FIELDS = ['fullName', 'email'];
const PROFILE_FIELDS = [
  'bloodGroup',
  'gender',
  'state',
  'district',
  'city',
  'pincode',
  'address',
  'weight',
  'emergencyContact',
];

/** Edits a person's own record — name and email for anyone, donor-profile fields for a donor. */
export async function updateUser(staff, userId, input) {
  const user = await loadTarget(userId);
  assertAppUser(user);

  const userData = {};
  if (input.fullName !== undefined) userData.name = input.fullName;
  if (input.email !== undefined) userData.email = input.email;

  const profileData = {};
  if (user.donorProfile) {
    for (const field of PROFILE_FIELDS) {
      if (input[field] !== undefined) profileData[field] = input[field];
    }
  }

  if (Object.keys(userData).length === 0 && Object.keys(profileData).length === 0) {
    throw ApiError.badRequest('NOTHING_TO_UPDATE', 'Change at least one field.');
  }

  try {
    const [updatedUser] = await prisma.$transaction([
      Object.keys(userData).length
        ? prisma.user.update({ where: { id: userId }, data: userData, include: { donorProfile: true } })
        : prisma.user.findUniqueOrThrow({ where: { id: userId }, include: { donorProfile: true } }),
      ...(Object.keys(profileData).length
        ? [prisma.donorProfile.update({ where: { userId }, data: profileData })]
        : []),
    ]);

    await recordAudit(prisma, {
      actorId: staff.id,
      action: AUDIT_ACTIONS.USER_UPDATED,
      targetUserId: userId,
      metadata: { fields: [...Object.keys(userData), ...Object.keys(profileData)] },
    });

    const refreshed = await prisma.user.findUnique({ where: { id: userId }, include: { donorProfile: true } });
    const summaries = await callSummariesFor([userId]);

    return { user: crmUserRow(refreshed, summaries.get(userId)), message: `${refreshed.name || 'This person'}'s record has been updated.` };
  } catch (err) {
    rethrowUniqueViolation(err);
  }
}

// ---------------------------------------------------------------------------
// Suspend / unsuspend
// ---------------------------------------------------------------------------

/**
 * BLOCKED is administrative and, unlike DEAD, not self-recoverable — see the UserStatus
 * doc comment in schema.prisma. A blocked donor or receiver is rejected at the auth
 * middleware itself; only an admin action here (ACTIVE again) lets them back in.
 */
export async function setUserStatus(staff, userId, { status, note }) {
  // STAFF may block (a report that this account should not be allowed in); only ADMIN may
  // undo one, the same split as reactivate vs mark-dead.
  if (status === 'ACTIVE' && staff.role !== 'ADMIN') {
    throw ApiError.forbidden('FORBIDDEN', 'Only an administrator can unblock an account.');
  }

  const user = await loadTarget(userId);
  assertAppUser(user);

  if (user.status === status) {
    throw ApiError.conflict(
      'ALREADY_IN_STATUS',
      `${user.name || 'This person'} is already ${status === 'BLOCKED' ? 'blocked' : 'active'}.`,
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: {
        status,
        // Blocking ends every session the same way marking a donor dead does; unblocking
        // does not restore one, for the same reason reactivate does not — see
        // donorLifecycleService.js.
        ...(status === 'BLOCKED' ? { tokenVersion: { increment: 1 } } : {}),
      },
    });

    await recordAudit(tx, {
      actorId: staff.id,
      action: status === 'BLOCKED' ? AUDIT_ACTIONS.USER_BLOCKED : AUDIT_ACTIONS.USER_UNBLOCKED,
      targetUserId: userId,
      note,
      metadata: { previousStatus: user.status },
    });

    return updated;
  });

  return {
    user: publicUser(updated),
    message:
      status === 'BLOCKED'
        ? `${updated.name || 'This person'} is blocked. They cannot sign in until an administrator unblocks the account.`
        : `${updated.name || 'This person'} is active again. They still need to sign in again, because their old session was ended when they were blocked.`,
  };
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Permanently removes a donor or receiver and everything Prisma cascades from them —
 * their profile, requests, matches, notifications, device tokens. `CallLog.staffId` is the
 * one relation this does NOT touch (it is RESTRICT, not CASCADE, and never applies here
 * since staff cannot be deleted through this path).
 *
 * The audit row deliberately carries no targetUserId: once the account is gone there is no
 * subject left to be accountable about (schema.prisma), and the row would cascade away
 * with it. The identifying details are kept in metadata instead, so the trail still shows
 * who was deleted and by whom.
 */
export async function deleteUser(staff, userId, { note } = {}) {
  const user = await loadTarget(userId);
  assertAppUser(user);

  await prisma.$transaction(async (tx) => {
    await recordAudit(tx, {
      actorId: staff.id,
      action: AUDIT_ACTIONS.USER_DELETED,
      note,
      metadata: { deletedUserId: user.id, name: user.name, phone: user.phone, email: user.email, role: user.role },
    });
    await tx.user.delete({ where: { id: userId } });
  });

  return { message: `${user.name || 'This person'} has been deleted from Red Express.` };
}
