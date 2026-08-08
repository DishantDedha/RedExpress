/**
 * The enum vocabularies the backend speaks, with the words staff read.
 *
 * These mirror the Prisma enums (backend/prisma/schema.prisma) and the labels in
 * backend/src/services/matching.js. They live here rather than being typed into each filter
 * form so that adding a status is one edit, and so a select can never offer a value the
 * backend's zod schema will reject.
 *
 * Every label is a full word or phrase, never a symbol alone: "O positive" is what gets
 * announced, "O+" is only ever the visual shorthand beside it.
 */

/** Ordered as the backend orders them — universal donor first. */
export const BLOOD_GROUPS = [
  { value: 'O_NEG', label: 'O negative', short: 'O-' },
  { value: 'O_POS', label: 'O positive', short: 'O+' },
  { value: 'A_NEG', label: 'A negative', short: 'A-' },
  { value: 'A_POS', label: 'A positive', short: 'A+' },
  { value: 'B_NEG', label: 'B negative', short: 'B-' },
  { value: 'B_POS', label: 'B positive', short: 'B+' },
  { value: 'AB_NEG', label: 'AB negative', short: 'AB-' },
  { value: 'AB_POS', label: 'AB positive', short: 'AB+' },
];

const BLOOD_GROUP_BY_VALUE = new Map(BLOOD_GROUPS.map((group) => [group.value, group]));

/** Falls back to the raw enum rather than an empty cell, so an unknown value is visible. */
export function bloodGroupLabel(value) {
  return BLOOD_GROUP_BY_VALUE.get(value)?.label ?? value ?? 'Not recorded';
}

export function bloodGroupShort(value) {
  return BLOOD_GROUP_BY_VALUE.get(value)?.short ?? value ?? '—';
}

export const ROLES = [
  { value: 'DONOR', label: 'Donor' },
  { value: 'RECEIVER', label: 'Receiver' },
  { value: 'STAFF', label: 'Staff' },
  { value: 'ADMIN', label: 'Administrator' },
];

export const USER_STATUSES = [
  { value: 'ACTIVE', label: 'Active' },
  { value: 'DEAD', label: 'Dead (unreachable)' },
  { value: 'BLOCKED', label: 'Blocked' },
];

export const REQUEST_STATUSES = [
  { value: 'OPEN', label: 'Open' },
  { value: 'FULFILLED', label: 'Fulfilled' },
  { value: 'CANCELLED', label: 'Cancelled' },
  { value: 'EXPIRED', label: 'Expired' },
];

export const URGENCIES = [
  { value: 'NORMAL', label: 'Normal' },
  { value: 'URGENT', label: 'Urgent' },
  { value: 'CRITICAL', label: 'Critical' },
];

/**
 * Call outcomes. MARKED_DEAD is read-only here — it is written by the mark-dead action
 * (Phase 14), never chosen from a list, which is why it carries no place in a form.
 */
export const CALL_OUTCOMES = {
  PICKED_UP: { label: 'Picked up', tone: 'success' },
  NO_ANSWER: { label: 'No answer', tone: 'warning' },
  WRONG_NUMBER: { label: 'Wrong number', tone: 'warning' },
  MARKED_DEAD: { label: 'Marked unreachable', tone: 'danger' },
};

export function callOutcomeLabel(outcome) {
  return CALL_OUTCOMES[outcome]?.label ?? outcome ?? 'Not recorded';
}

/** A donor's answer to a push notification. */
export const MATCH_RESPONSES = {
  PENDING: { label: 'No answer yet', tone: 'neutral' },
  ACCEPTED: { label: 'Accepted', tone: 'success' },
  DECLINED: { label: 'Declined', tone: 'warning' },
};

/** Audit actions, phrased as sentences a new staff member can read (see auditService.js). */
export const AUDIT_ACTION_LABELS = {
  DONOR_MARKED_DEAD: 'Marked unreachable (dead)',
  DONOR_REACTIVATED: 'Reactivated',
};

/** Matches the backend's SEARCH_DEFAULT_PAGE_SIZE so page numbers line up with its paging. */
export const PAGE_SIZE = 20;
