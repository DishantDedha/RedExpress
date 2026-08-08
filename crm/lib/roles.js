/**
 * Role rules, in one place, shared by server and client code.
 *
 * These decide what the UI *shows*. They are not authorization — the backend enforces the
 * same split with requireRole() on /crm routes, and it is the only opinion that counts.
 * Hiding a button stops a mistake; it does not stop an attacker.
 *
 * The split itself (see backend/docs/crm-lifecycle.md): STAFF may take a donor out of
 * circulation, because that is a report from the phones. Only an ADMIN may put them back,
 * because that overrules one.
 */

export const ROLE_LABELS = {
  ADMIN: 'Administrator',
  STAFF: 'Staff',
  DONOR: 'Donor',
  RECEIVER: 'Receiver',
};

export function isAdmin(user) {
  return user?.role === 'ADMIN';
}

export function isStaff(user) {
  return user?.role === 'STAFF' || user?.role === 'ADMIN';
}

/** Marking a donor unreachable — STAFF and ADMIN (Phase 14). */
export function canMarkDead(user) {
  return isStaff(user);
}

/** Reactivating a donor the staff marked dead — ADMIN only (Phase 14). */
export function canReactivate(user) {
  return isAdmin(user);
}

export function roleLabel(role) {
  return ROLE_LABELS[role] ?? role;
}
