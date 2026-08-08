/**
 * Display formatting.
 *
 * Two rules run through all of it:
 *
 *  1. **Never render an empty cell.** A blank means "I don't know whether this is missing or
 *     whether the page broke". Every formatter has a spoken fallback ("Not recorded"), because
 *     a table read aloud is a sequence of values with no visual grid to explain the gaps.
 *  2. **Dates are formatted with a fixed locale and time zone.** A server component and the
 *     browser that hydrates it must agree on the string, or React throws a hydration mismatch
 *     and — worse — two staff members reading the same row disagree about when a call happened.
 *     Everything is rendered in Asia/Kolkata, where the operations team works.
 */

const LOCALE = 'en-IN';
const TIME_ZONE = 'Asia/Kolkata';

const DATE_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: TIME_ZONE,
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat(LOCALE, {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
  timeZone: TIME_ZONE,
});

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatDate(value, fallback = 'Not recorded') {
  const date = toDate(value);
  return date ? DATE_FORMAT.format(date) : fallback;
}

export function formatDateTime(value, fallback = 'Not recorded') {
  const date = toDate(value);
  return date ? DATE_TIME_FORMAT.format(date) : fallback;
}

/**
 * "2 hours ago" / "in 40 minutes".
 *
 * Only ever shown *next to* an absolute timestamp, never instead of one: "3 days ago" is easy
 * to skim and useless for writing down, and it drifts out of date on a page left open during a
 * long calling session.
 */
export function formatRelative(value, fallback = '') {
  const date = toDate(value);
  if (!date) return fallback;

  const seconds = Math.round((date.getTime() - Date.now()) / 1000);
  const absolute = Math.abs(seconds);

  const units = [
    ['minute', 60],
    ['hour', 3600],
    ['day', 86400],
    ['month', 2592000],
    ['year', 31536000],
  ];

  if (absolute < 60) return seconds >= 0 ? 'in a moment' : 'just now';

  let chosen = ['minute', 60];
  for (const unit of units) {
    if (absolute >= unit[1]) chosen = unit;
  }

  const [unit, size] = chosen;
  const amount = Math.round(seconds / size);
  return new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' }).format(amount, unit);
}

/**
 * Distance, rounded to something a person would say out loud.
 *
 * Under a kilometre becomes metres — "0.4 km" is how far away a donor is, "400 metres" is
 * whether staff should ring them first.
 */
export function formatDistance(km, fallback = 'Distance unknown') {
  if (km === null || km === undefined || Number.isNaN(Number(km))) return fallback;

  const value = Number(km);
  if (value < 1) return `${Math.round(value * 1000)} metres`;
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} km`;
}

/** "Cuttack, Odisha" from whichever of the parts are present. */
export function formatArea(...parts) {
  const filtered = parts.filter((part) => part && String(part).trim());
  return filtered.length ? filtered.join(', ') : 'Not recorded';
}

/**
 * Phone numbers are shown exactly as stored (E.164, e.g. +919876500001).
 *
 * Deliberately not prettified into groups: staff read these aloud and type them into a
 * handset, and a number broken into chunks by a formatter that guessed the country wrong is a
 * wrong number dialled.
 */
export function formatPhone(phone, fallback = 'No phone number') {
  return phone ? phone : fallback;
}

/** Coordinates for display. Six decimals is roughly a tenth of a metre — plenty. */
export function formatCoordinates(latitude, longitude, fallback = 'No location recorded') {
  if (latitude === null || latitude === undefined || longitude === null || longitude === undefined) {
    return fallback;
  }
  return `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`;
}

/** Plural without the "(s)" that screen readers read as "s in brackets". */
export function pluralize(count, singular, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}
