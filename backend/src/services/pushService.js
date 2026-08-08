import { Expo } from 'expo-server-sdk';
import { env } from '../config/env.js';

/**
 * The push transport. Takes fully-formed Expo messages and gets them to phones.
 *
 * Same shape as smsService: one provider-agnostic function, drivers chosen by env
 * (PUSH_PROVIDER). The "console" driver prints instead of sending, which is the only way
 * to exercise the notification path on a machine with no device attached — Expo Go cannot
 * receive pushes at all, so without it Phase 5 would be untestable until Phase 10.
 *
 * Nothing here knows what a blood request is. Copy lives in pushMessages.js, the domain
 * rules in notificationService.js.
 */

// ---------------------------------------------------------------------------
// Ticket / receipt vocabulary
// ---------------------------------------------------------------------------

/**
 * Expo answers a send with a *ticket* (accepted for delivery, or rejected outright) and,
 * some minutes later, a *receipt* (what the platform gateway actually did with it). Both
 * can say DeviceNotRegistered, and both are the only reliable signal that a stored token
 * is dead — so both feed the same `invalidTokens` list, which the caller deletes.
 */
const DEAD_TOKEN_ERRORS = new Set(['DeviceNotRegistered', 'InvalidCredentials']);

function isDeadTokenError(details) {
  return Boolean(details?.error && DEAD_TOKEN_ERRORS.has(details.error));
}

// ---------------------------------------------------------------------------
// Drivers
// ---------------------------------------------------------------------------

const consoleProvider = {
  name: 'console',

  isValidToken() {
    // Deliberately permissive: local smoke scripts register made-up tokens, and rejecting
    // them here would hide the very code path being tested.
    return true;
  },

  async send(messages) {
    for (const message of messages) {
      console.log(`\n[push:console] to ${message.to}\n  ${message.title}\n  ${message.body}\n  data: ${JSON.stringify(message.data)}\n`);
    }
    return {
      provider: 'console',
      sent: messages.length,
      failed: 0,
      invalidTokens: [],
      tickets: [],
      errors: [],
    };
  },

  async collectReceipts() {
    return { checked: 0, invalidTokens: [], errors: [] };
  },
};

/** Splits an array into runs of at most `size`. A non-positive size means "don't split". */
function splitInto(items, size) {
  if (!Number.isFinite(size) || size < 1 || items.length <= size) return [items];
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

let expoClient = null;

function client() {
  if (!expoClient) {
    // The access token is only required when the Expo project has push security enabled;
    // an empty string would be sent as a bearer header, so pass undefined instead.
    expoClient = new Expo({ accessToken: env.push.expo.accessToken || undefined });
  }
  return expoClient;
}

const expoProvider = {
  name: 'expo',

  isValidToken(token) {
    return Expo.isExpoPushToken(token);
  },

  /**
   * Sends in chunks.
   *
   * The SDK's chunker enforces Expo's own limits (100 messages, and a byte ceiling it
   * knows about); EXPO_PUSH_CHUNK_SIZE can only make the chunks smaller, which is
   * occasionally what a flaky connection needs. Both are applied, smallest wins.
   *
   * A chunk that throws — network down, Expo having an outage — must not take the rest
   * with it: a request that matched 60 donors should reach 40 of them rather than none.
   * Failures are collected and returned, never thrown, because the caller is usually
   * mid-way through creating a blood request and the request matters more than the push.
   */
  async send(messages) {
    const chunks = client()
      .chunkPushNotifications(messages)
      .flatMap((chunk) => splitInto(chunk, env.push.expo.chunkSize));
    const tickets = [];
    const invalidTokens = [];
    const errors = [];
    let sent = 0;
    let failed = 0;

    for (const chunk of chunks) {
      let receipts;
      try {
        receipts = await client().sendPushNotificationsAsync(chunk);
      } catch (err) {
        failed += chunk.length;
        errors.push({ scope: 'chunk', message: err?.message ?? String(err), count: chunk.length });
        continue;
      }

      // Tickets come back positionally, one per message in the chunk.
      receipts.forEach((ticket, index) => {
        const token = chunk[index]?.to;

        if (ticket.status === 'ok') {
          sent++;
          if (ticket.id) tickets.push({ id: ticket.id, token });
          return;
        }

        failed++;
        if (isDeadTokenError(ticket.details)) {
          invalidTokens.push(token);
        } else {
          errors.push({ scope: 'ticket', token, message: ticket.message, code: ticket.details?.error });
        }
      });
    }

    return { provider: 'expo', sent, failed, invalidTokens, tickets, errors };
  },

  /**
   * Second-stage check. A ticket only means Expo accepted the message; the receipt is
   * where "the phone uninstalled the app three weeks ago" finally shows up. Expo keeps
   * receipts for 24 hours and asks that they not be polled immediately, hence the delay
   * in notificationService.
   */
  async collectReceipts(tickets) {
    if (!tickets.length) return { checked: 0, invalidTokens: [], errors: [] };

    const byId = new Map(tickets.map(({ id, token }) => [id, token]));
    const invalidTokens = [];
    const errors = [];
    let checked = 0;

    for (const chunk of client().chunkPushNotificationReceiptIds([...byId.keys()])) {
      let receipts;
      try {
        receipts = await client().getPushNotificationReceiptsAsync(chunk);
      } catch (err) {
        errors.push({ scope: 'receipt-fetch', message: err?.message ?? String(err) });
        continue;
      }

      for (const [id, receipt] of Object.entries(receipts)) {
        checked++;
        if (receipt.status === 'ok') continue;
        if (isDeadTokenError(receipt.details)) {
          invalidTokens.push(byId.get(id));
        } else {
          errors.push({ scope: 'receipt', message: receipt.message, code: receipt.details?.error });
        }
      }
    }

    return { checked, invalidTokens: invalidTokens.filter(Boolean), errors };
  },
};

const providers = {
  console: consoleProvider,
  expo: expoProvider,
};

let warnedAboutConsoleInProduction = false;

export function getPushProvider() {
  const provider = providers[env.push.provider];
  if (!provider) {
    throw new Error(
      `Unknown PUSH_PROVIDER "${env.push.provider}". Supported: ${Object.keys(providers).join(', ')}`,
    );
  }

  // Silently printing every "blood needed nearby" to a log file in production would be a
  // quiet, total failure of the product's only real-time channel. Say so, once.
  if (provider.name === 'console' && env.isProduction && !warnedAboutConsoleInProduction) {
    warnedAboutConsoleInProduction = true;
    console.warn('[push] PUSH_PROVIDER=console in production — no donor will receive a notification.');
  }

  return provider;
}

/** True when this string is a token the active provider will accept. */
export function isValidPushToken(token) {
  return getPushProvider().isValidToken(token);
}

/**
 * Delivers a batch of Expo messages.
 * Resolves with { sent, failed, invalidTokens, tickets, errors } — it does not throw, so
 * a push outage can never fail a blood request.
 */
export async function sendPushMessages(messages) {
  if (!messages.length) {
    return { provider: env.push.provider, sent: 0, failed: 0, invalidTokens: [], tickets: [], errors: [] };
  }
  return getPushProvider().send(messages);
}

/** Looks up delivery receipts for tickets returned by a previous send. */
export async function collectPushReceipts(tickets) {
  return getPushProvider().collectReceipts(tickets);
}
