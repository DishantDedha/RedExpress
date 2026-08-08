import { z } from 'zod';
import { env } from '../config/env.js';
import { bloodGroup, latitude, longitude, optionalText, phoneNumber, requiredText } from './common.js';
import { pagination } from './searchSchemas.js';

/**
 * Blood request shapes. Messages are written to be read aloud — the mobile form attaches
 * each `fields` entry to its input and announces the first one.
 */

const URGENCIES = ['NORMAL', 'URGENT', 'CRITICAL'];
const STATUSES = ['OPEN', 'FULFILLED', 'CANCELLED', 'EXPIRED'];
const RESPONSES = ['PENDING', 'ACCEPTED', 'DECLINED'];

function upperEnum(values, message) {
  return z.preprocess(
    (value) => (typeof value === 'string' ? value.trim().toUpperCase() : value),
    z.enum(values, { errorMap: () => ({ message }) }),
  );
}

const urgency = upperEnum(URGENCIES, 'Choose how urgent this is.');
const requestStatus = upperEnum(STATUSES, 'Choose a status.');
const matchResponse = upperEnum(RESPONSES, 'Choose whether you can donate.');

const unitsNeeded = z.preprocess(
  (value) => {
    if (typeof value === 'string' && value.trim() !== '') {
      const parsed = Number(value.trim());
      return Number.isNaN(parsed) ? value : parsed;
    }
    return value;
  },
  z
    .number({ required_error: 'Enter how many units are needed.', invalid_type_error: 'Units must be a number.' })
    .int('Units must be a whole number.')
    .min(1, 'At least one unit is needed.')
    .max(env.request.maxUnits, `Enter ${env.request.maxUnits} units or fewer.`),
);

/**
 * Expiry is when the request stops notifying and drops off the boards. Bounded on both
 * sides: a request that expires in the past would be dead on arrival, and one that never
 * expires becomes a permanent list of someone's medical emergency.
 */
const expiresAt = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() !== '' ? value.trim() : value),
  z
    .string()
    .refine((value) => !Number.isNaN(Date.parse(value)), 'Enter an expiry time as an ISO date.')
    .transform((value) => new Date(value))
    .refine((date) => date.getTime() > Date.now(), 'The expiry time must be in the future.')
    .refine(
      (date) => date.getTime() <= Date.now() + env.request.maxExpiryHours * 60 * 60 * 1000,
      `A request can stay open for at most ${env.request.maxExpiryHours} hours.`,
    )
    .optional(),
);

export const createRequestSchema = z
  .object({
    bloodGroup,
    unitsNeeded,
    hospitalName: requiredText('the hospital name', { min: 2, max: 160 }),
    contactPhone: phoneNumber('a contact number'),
    urgency: urgency.optional().default('NORMAL'),
    note: optionalText('a note', { max: 1000 }),

    // Either coordinates or an address the server can geocode. Neither is fatal — a
    // request with no position falls back to district matching.
    state: optionalText('a state', { max: 80 }),
    district: optionalText('a district', { max: 80 }),
    city: optionalText('a city', { max: 80 }),
    address: optionalText('an address', { max: 500 }),
    latitude: latitude.optional(),
    longitude: longitude.optional(),

    expiresAt,
  })
  .refine((data) => (data.latitude === undefined) === (data.longitude === undefined), {
    message: 'Send latitude and longitude together, or neither.',
    path: ['latitude'],
  })
  .refine((data) => data.latitude !== undefined || data.district || data.address, {
    // Without one of these the matching engine has nothing to work with and the request
    // would sit there matching nobody, which looks like a bug to someone in a hospital.
    message: 'Add your location, or at least a district, so nearby donors can be found.',
    path: ['district'],
  });

export const listRequestsQuerySchema = z.object({
  /// mine = requests I posted, matched = requests I was asked to help with,
  /// all = everything (staff only).
  scope: z.enum(['mine', 'matched', 'all']).optional(),
  bloodGroup: bloodGroup.optional(),
  status: requestStatus.optional(),
  urgency: urgency.optional(),
  state: optionalText('a state', { max: 80 }),
  district: optionalText('a district', { max: 80 }),
  city: optionalText('a city', { max: 80 }),
  ...pagination,
});

export const updateRequestStatusSchema = z.object({
  status: requestStatus,
  note: optionalText('a note', { max: 1000 }),
});

export const listMatchesQuerySchema = z.object({
  response: matchResponse.optional(),
});

export const respondToMatchSchema = z.object({
  // PENDING is a starting state, not an answer — a donor either can help or cannot.
  response: upperEnum(['ACCEPTED', 'DECLINED'], 'Choose whether you can donate.'),
});
