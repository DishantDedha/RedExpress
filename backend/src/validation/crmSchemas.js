import { z } from 'zod';
import { bloodGroup, optionalText } from './common.js';
import { pagination } from './searchSchemas.js';
import { MANUAL_CALL_OUTCOMES } from '../services/callLogService.js';

/**
 * Schemas for the STAFF/ADMIN endpoints.
 *
 * The note fields are the audit trail's only human input, so they are generous with
 * length and stingy with nothing else — a staff member explaining why they took someone
 * out of circulation should never lose the sentence to a validator.
 */

/** Free-text note attached to a sensitive action. Blank is treated as absent. */
const auditNote = optionalText('a note', { max: 1000 });

export const userSearchQuerySchema = z.object({
  /// One box, matched against name, phone and email.
  q: optionalText('a search term', { max: 120 }),

  role: z.enum(['DONOR', 'RECEIVER', 'STAFF', 'ADMIN'], { errorMap: () => ({ message: 'Choose a valid role.' }) }).optional(),
  status: z
    .enum(['ACTIVE', 'DEAD', 'BLOCKED'], { errorMap: () => ({ message: 'Choose a valid status.' }) })
    .optional(),
  bloodGroup: bloodGroup.optional(),

  state: optionalText('a state', { max: 80 }),
  district: optionalText('a district', { max: 80 }),
  city: optionalText('a city', { max: 80 }),

  ...pagination,
});

export const nearbyDonorsQuerySchema = z.object({
  requestId: z
    .string({ required_error: 'Choose a blood request.' })
    .trim()
    .min(1, 'Choose a blood request.'),
});

export const createCallLogSchema = z.object({
  donorUserId: z.string({ required_error: 'Choose a donor.' }).trim().min(1, 'Choose a donor.'),
  /// Which request the staff member was working when they rang. Optional: some calls are
  /// housekeeping ("are you still willing to donate?") and belong to no request.
  requestId: optionalText('a request', { max: 64 }),
  outcome: z.enum(MANUAL_CALL_OUTCOMES, {
    errorMap: () => ({ message: 'Choose picked up, no answer or wrong number.' }),
  }),
  note: auditNote,
});

export const markDeadSchema = z.object({
  note: auditNote,
  /// The request being worked when the donor turned out to be unreachable, so the call log
  /// lands on the right worklist.
  requestId: optionalText('a request', { max: 64 }),
});

export const reactivateSchema = z.object({
  note: auditNote,
});

export const callLogQuerySchema = z.object({
  donorUserId: optionalText('a donor', { max: 64 }),
  requestId: optionalText('a request', { max: 64 }),
  staffId: optionalText('a staff member', { max: 64 }),
  take: z.preprocess(
    (value) => (value === undefined || value === '' ? 20 : Number(value)),
    z.number().int().min(1).max(100),
  ),
});
