import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import { ApiError } from '../utils/errors.js';
import { collectPushReceipts, sendPushMessages } from './pushService.js';
import { buildMatchNotification } from './pushMessages.js';

/**
 * Notifications: the in-app inbox and the push that announces it.
 *
 * Two rules shape everything here.
 *
 * 1. The Notification row is written first and unconditionally. A push can be swallowed
 *    by a dead token, a revoked permission, an Expo outage, or a phone in a hospital
 *    basement — the inbox is the record that survives all of that, and for a donor who
 *    reads their notifications with a screen reader it is often the primary surface, not
 *    a fallback.
 *
 * 2. Sending never throws. Every caller is in the middle of something that matters more
 *    (creating a blood request, recording a response). Push failures are returned and
 *    logged, not raised.
 */

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

export function notificationView(row) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    data: row.data ?? null,
    isRead: row.readAt !== null,
    readAt: row.readAt,
    createdAt: row.createdAt,
  };
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

/**
 * Turns one notification plus one device token into an Expo message.
 *
 * `notificationId` rides along in `data` so a tap can mark the inbox row read without a
 * second round-trip, and `channelId` picks the Android notification channel the app
 * creates at startup (its importance is what decides whether the phone makes a sound).
 */
function toExpoMessage(token, notification, notificationId) {
  return {
    to: token,
    title: notification.title,
    body: notification.body,
    data: { ...notification.data, notificationId },
    sound: 'default',
    priority: notification.priority ?? 'default',
    channelId: env.push.androidChannelId,
    // Expo drops the message rather than delivering a stale "blood needed nearby" hours
    // later; matching the request's own urgency window is the honest ceiling.
    ttl: env.push.ttlSeconds,
  };
}

/**
 * Deletes tokens the gateway told us are dead.
 *
 * Uninstalls are the common case. Doing this eagerly is what keeps the DeviceToken table
 * from slowly turning into a list of phones that no longer exist, which would make every
 * future send slower and noisier for no delivered notification.
 */
async function dropInvalidTokens(tokens) {
  const unique = [...new Set(tokens.filter(Boolean))];
  if (!unique.length) return 0;

  const { count } = await prisma.deviceToken.deleteMany({ where: { expoPushToken: { in: unique } } });
  if (count) console.log(`[push] dropped ${count} unregistered device token(s)`);
  return count;
}

/**
 * Schedules the receipt check.
 *
 * Expo asks that receipts not be read immediately — the gateways have not answered yet —
 * so this waits PUSH_RECEIPT_DELAY_MS and then looks. The timer is unref'd so it can
 * never hold the process open, which also means a restart loses any pending check: the
 * cost is a dead token surviving until its owner's next notification, which the ticket
 * pass usually catches anyway. A durable version would need a receipts table; see
 * docs/notifications.md.
 */
function scheduleReceiptCheck(tickets) {
  if (!env.push.checkReceipts || !tickets.length) return;

  const timer = setTimeout(async () => {
    try {
      const { checked, invalidTokens, errors } = await collectPushReceipts(tickets);
      if (invalidTokens.length) await dropInvalidTokens(invalidTokens);
      if (errors.length) console.warn(`[push] ${errors.length} receipt error(s)`, errors.slice(0, 5));
      if (checked) console.log(`[push] checked ${checked} receipt(s)`);
    } catch (err) {
      console.error('[push] receipt check failed', err);
    }
  }, env.push.receiptDelayMs);

  timer.unref?.();
}

/**
 * Delivers already-created Notification rows to their owners' devices.
 *
 * Takes the rows rather than creating them so the fan-out path can write every row in one
 * statement and still send in one batch.
 */
async function deliver(entries) {
  if (!entries.length) return { sent: 0, failed: 0, recipientsWithoutDevice: 0, errors: [] };

  const userIds = [...new Set(entries.map((entry) => entry.userId))];
  const devices = await prisma.deviceToken.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, expoPushToken: true },
  });

  const tokensByUser = new Map();
  for (const device of devices) {
    const list = tokensByUser.get(device.userId) ?? [];
    list.push(device.expoPushToken);
    tokensByUser.set(device.userId, list);
  }

  const messages = [];
  let recipientsWithoutDevice = 0;

  for (const entry of entries) {
    const tokens = tokensByUser.get(entry.userId) ?? [];
    // Not an error: plenty of donors decline the notification permission, and the inbox
    // row already exists for them.
    if (!tokens.length) {
      recipientsWithoutDevice++;
      continue;
    }
    for (const token of tokens) {
      messages.push(toExpoMessage(token, entry.notification, entry.notificationId));
    }
  }

  const result = await sendPushMessages(messages);

  if (result.invalidTokens.length) await dropInvalidTokens(result.invalidTokens);
  if (result.errors.length) console.warn(`[push] ${result.errors.length} send error(s)`, result.errors.slice(0, 5));
  scheduleReceiptCheck(result.tickets);

  return {
    sent: result.sent,
    failed: result.failed,
    recipientsWithoutDevice,
    errors: result.errors,
  };
}

/**
 * The one-recipient entry point: writes the inbox row, then pushes it.
 *
 * `notification` is what pushMessages.js produces — { type, title, body, data, priority }.
 */
export async function sendPush(userId, notification) {
  const row = await prisma.notification.create({
    data: {
      userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: notification.data ?? undefined,
    },
  });

  const delivery = await deliver([{ userId, notification, notificationId: row.id }]);

  return { notification: notificationView(row), delivery };
}

/**
 * Fan-out for the matching engine: one push per matched donor, each with their own
 * distance, in a single batch.
 *
 * `matches` are RequestMatch rows (id, donorUserId, distanceKm). Returns how many donors
 * were actually reached, and stamps notifiedAt on the rows that got a message — which is
 * what makes the CRM able to tell "we asked them and they went quiet" from "we never
 * managed to ask them".
 */
export async function notifyMatchedDonors(request, matches) {
  if (!matches.length) {
    return { notified: 0, sent: 0, failed: 0, recipientsWithoutDevice: 0 };
  }

  const built = matches.map((match) => ({
    match,
    notification: buildMatchNotification({
      request,
      distanceKm: match.distanceKm,
      matchId: match.id,
    }),
  }));

  // createMany does not return ids, and each row needs its own id in the push payload, so
  // the rows are created individually inside one transaction. At MATCH_MAX_CANDIDATES=100
  // that is a bounded, one-off cost on a path that already did several queries.
  const rows = await prisma.$transaction(
    built.map(({ match, notification }) =>
      prisma.notification.create({
        data: {
          userId: match.donorUserId,
          type: notification.type,
          title: notification.title,
          body: notification.body,
          data: notification.data,
        },
        select: { id: true, userId: true },
      }),
    ),
  );

  const delivery = await deliver(
    built.map(({ match, notification }, index) => ({
      userId: match.donorUserId,
      notification,
      notificationId: rows[index].id,
    })),
  );

  const notifiedAt = new Date();
  await prisma.requestMatch.updateMany({
    where: { id: { in: matches.map((match) => match.id) } },
    data: { notifiedAt },
  });

  return {
    notified: matches.length,
    sent: delivery.sent,
    failed: delivery.failed,
    recipientsWithoutDevice: delivery.recipientsWithoutDevice,
  };
}

// ---------------------------------------------------------------------------
// Inbox
// ---------------------------------------------------------------------------

/**
 * The in-app inbox. Newest first, with the unread count alongside — the mobile screen
 * announces "3 unread notifications" on entry, and a second request for that number would
 * make the announcement race the list.
 */
export async function listNotifications(user, params = {}) {
  const pageSize = Math.min(Math.max(params.pageSize ?? env.search.defaultPageSize, 1), env.search.maxPageSize);
  const page = Math.max(params.page ?? 1, 1);
  const skip = (page - 1) * pageSize;

  const where = { userId: user.id, ...(params.unreadOnly ? { readAt: null } : {}) };

  const [total, rows, unreadCount] = await prisma.$transaction([
    prisma.notification.count({ where }),
    prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take: pageSize }),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);

  return {
    results: rows.map(notificationView),
    page,
    pageSize,
    total,
    hasMore: skip + rows.length < total,
    unreadCount,
  };
}

/**
 * Marks one notification read.
 *
 * Idempotent — the app calls this on open, on tap-through from the tray, and sometimes
 * both — so a row that is already read keeps its original readAt rather than being
 * quietly re-stamped.
 */
export async function markNotificationRead(user, id) {
  const row = await prisma.notification.findUnique({ where: { id } });

  // Same 404 for "does not exist" and "belongs to someone else": a stranger must not be
  // able to probe for valid notification ids.
  if (!row || row.userId !== user.id) {
    throw ApiError.notFound('NOTIFICATION_NOT_FOUND', 'That notification is no longer available.');
  }

  const updated = row.readAt
    ? row
    : await prisma.notification.update({ where: { id }, data: { readAt: new Date() } });

  const unreadCount = await prisma.notification.count({ where: { userId: user.id, readAt: null } });

  return { notification: notificationView(updated), unreadCount };
}
