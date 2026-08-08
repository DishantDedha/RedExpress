import { z } from 'zod';
import { env } from '../config/env.js';
import { bloodGroup, boolish, latitude, longitude, optionalText } from './common.js';

/**
 * Query-string schemas. Everything arrives as a string, so each field is coerced here and
 * the services can assume real numbers and booleans.
 */

/** Positive integer from a query parameter, with a default when the key is absent. */
function positiveInt(label, { fallback, max }) {
  return z.preprocess(
    (value) => {
      if (value === undefined || value === null || value === '') return fallback;
      const parsed = Number(value);
      return Number.isNaN(parsed) ? value : parsed;
    },
    z
      .number({ invalid_type_error: `${label} must be a number.` })
      .int(`${label} must be a whole number.`)
      .min(1, `${label} must be at least 1.`)
      .max(max, `${label} must be ${max} or less.`),
  );
}

export const pagination = {
  page: positiveInt('Page', { fallback: 1, max: 100_000 }),
  pageSize: positiveInt('Page size', { fallback: env.search.defaultPageSize, max: env.search.maxPageSize }),
};

const radiusKm = z.preprocess(
  (value) => {
    if (value === undefined || value === null || value === '') return undefined;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  },
  z
    .number({ invalid_type_error: 'Radius must be a number of kilometres.' })
    .positive('Radius must be greater than zero.')
    .max(env.search.maxRadiusKm, `Radius must be ${env.search.maxRadiusKm} km or less.`)
    .optional(),
);

/**
 * `lat`/`lng` are the short names the mobile screen sends; `latitude`/`longitude` are
 * what the rest of the API uses. Both are accepted and normalised to the long form here
 * so no service has to know there were ever two spellings.
 */
function coordinateAliases(value) {
  if (!value || typeof value !== 'object') return value;
  const { lat, lng, ...rest } = value;
  return {
    ...rest,
    latitude: rest.latitude ?? lat,
    longitude: rest.longitude ?? lng,
  };
}

/**
 * GET /donors/search
 *
 * Coordinates are all-or-nothing, exactly as on the registration form: half a position
 * would silently turn a proximity search into a nationwide one.
 */
const donorSearchShape = z
  .object({
    bloodGroup: bloodGroup.optional(),
    /// true widens an exact group to every group that can donate to it (O- for everyone).
    compatible: boolish().optional().default(false),

    state: optionalText('a state', { max: 80 }),
    district: optionalText('a district', { max: 80 }),
    city: optionalText('a city', { max: 80 }),

    latitude: latitude.optional(),
    longitude: longitude.optional(),
    radiusKm,

    /// Defaults to true: a donor who has switched themselves off is not a search result,
    /// they are a person who asked not to be called.
    availableOnly: boolish().optional().default(true),

    ...pagination,
  })
  .refine((data) => (data.latitude === undefined) === (data.longitude === undefined), {
    message: 'Send latitude and longitude together, or neither.',
    path: ['latitude'],
  })
  .refine((data) => data.radiusKm === undefined || data.latitude !== undefined, {
    message: 'A radius needs a latitude and longitude to measure from.',
    path: ['radiusKm'],
  });

export const donorSearchQuerySchema = z.preprocess(coordinateAliases, donorSearchShape);
