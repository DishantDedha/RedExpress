import { prisma } from '../config/prisma.js';

/**
 * The audit trail for actions staff take on someone else's account.
 *
 * Only the consequential ones live here — the things that remove a person from search or
 * put them back in. Ordinary reads are not audited: a log that records everything gets
 * read by nobody.
 *
 * Every writer passes a Prisma client, which in practice is the interactive transaction
 * that also flipped the status. That is the point: a status change without its audit row,
 * or an audit row describing a change that did not commit, are both worse than neither.
 */

export const AUDIT_ACTIONS = Object.freeze({
  DONOR_MARKED_DEAD: 'DONOR_MARKED_DEAD',
  DONOR_REACTIVATED: 'DONOR_REACTIVATED',
});

/**
 * Writes one audit row.
 *
 * @param {import('@prisma/client').PrismaClient} tx  client or transaction to write with
 * @param {object} entry
 * @param {string} entry.actorId       staff/admin who did it
 * @param {string} entry.action        one of AUDIT_ACTIONS
 * @param {string} [entry.targetUserId] whose account it was done to
 * @param {string} [entry.note]        the staff member's own words
 * @param {object} [entry.metadata]    machine-readable before/after
 */
export function recordAudit(tx, { actorId, action, targetUserId, note, metadata }) {
  return tx.auditLog.create({
    data: {
      actorId,
      action,
      targetUserId: targetUserId ?? null,
      note: note ?? null,
      metadata: metadata ?? undefined,
    },
  });
}

/** Shapes an audit row for the CRM's history panel. */
export function auditView(entry) {
  return {
    id: entry.id,
    action: entry.action,
    note: entry.note,
    metadata: entry.metadata ?? null,
    createdAt: entry.createdAt,
    actorId: entry.actorId,
    actorName: entry.actor?.name ?? null,
  };
}

/** Recent audit history for one account, newest first. */
export async function listAuditForUser(userId, { take = 20 } = {}) {
  const rows = await prisma.auditLog.findMany({
    where: { targetUserId: userId },
    orderBy: { createdAt: 'desc' },
    take,
    include: { actor: { select: { name: true } } },
  });
  return rows.map(auditView);
}
