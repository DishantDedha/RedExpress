import { api } from './apiClient';
import { toQuery } from './donors';

/**
 * The in-app inbox.
 *
 * Every push the backend sends also writes a `Notification` row, so the inbox is the
 * durable copy: a notification dismissed from the tray, or never delivered because the
 * phone was off, is still here. That matters more than it sounds — a push is best-effort,
 * and "someone nearby needs your blood group" is not a message to lose.
 */

/**
 * @param {boolean} [params.unreadOnly]
 * @returns {Promise<{ results, page, pageSize, total, hasMore, unreadCount }>}
 *          `unreadCount` comes back on every response, including a filtered one, so the
 *          badge never has to be derived from a page of results.
 */
export function listNotifications(params = {}) {
  return api.get(`/notifications${toQuery(params)}`);
}

/** Idempotent — a row that is already read keeps its original `readAt`. */
export function markNotificationRead(id) {
  return api.patch(`/notifications/${encodeURIComponent(id)}/read`, {});
}

/**
 * "2 hours ago" — a relative time, because an absolute one makes the reader work out how
 * old a notification is, and the age is the whole point of an emergency inbox.
 */
export function timeAgo(value) {
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return '';

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;

  const days = Math.round(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}
