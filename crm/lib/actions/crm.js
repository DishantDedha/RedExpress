'use server';

import { revalidatePath } from 'next/cache';
import { apiGet, apiSend, requireSession } from '@/lib/session';
import { BackendError } from '@/lib/api';
import { canMarkDead, canReactivate } from '@/lib/roles';

/**
 * The three things staff *do* to a record: log a call, take a donor out of circulation, put
 * them back.
 *
 * Server actions rather than client fetches, for the same reason the token exchange is server
 * side — the access token stays in an httpOnly cookie and never enters client JavaScript. The
 * browser posts to its own origin and Next attaches the cookie.
 *
 * ## The result contract
 *
 * None of these throw at the caller. Each returns
 *
 *   { ok: true,  message, ...payload }
 *   { ok: false, message, code }
 *
 * because every one of them is fired from a button in a table row, and the honest response to
 * "no answer was not recorded" is a toast next to that button — not an error page that throws
 * away a staff member's place in a worklist of forty names. Only a dead session escapes as a
 * redirect (see apiSend).
 *
 * ## On the role checks below
 *
 * They are duplicated from the backend on purpose, and they are not the enforcement. The
 * backend's `requireRole('ADMIN')` on reactivate is. Checking here too means a STAFF member who
 * somehow reaches the action gets a sentence explaining the rule instead of a raw 403, and it
 * documents the split at the point of use.
 */

/** Turns a BackendError into the failure half of the contract. */
function failure(error) {
  if (error instanceof BackendError) {
    return { ok: false, message: error.message, code: error.code };
  }
  throw error;
}

/**
 * Both the request worklist and the person's own page show call history and status, and either
 * can be open when an action fires. Revalidating the dashboard subtree is blunt but correct:
 * these pages are all `no-store` reads, so this is only clearing the client router cache, and
 * a stale "Never called" on the page a staff member navigates to next is exactly the bug that
 * makes someone ring a donor twice.
 */
function revalidateDashboard() {
  revalidatePath('/dashboard', 'layout');
}

// ---------------------------------------------------------------------------
// Call outcomes
// ---------------------------------------------------------------------------

/**
 * Records what happened when a staff member rang a donor.
 *
 * `requestId` is passed through whenever the call was made off a request's worklist, so the
 * history reads "three attempts for this request" rather than three unattributed calls.
 * Housekeeping calls made from a person's own page have no request, and that is allowed.
 */
export async function recordCallAction({ donorUserId, requestId, outcome, note }) {
  const staff = await requireSession();
  if (!canMarkDead(staff)) {
    return { ok: false, message: 'Your account cannot record calls.', code: 'FORBIDDEN' };
  }

  try {
    const result = await apiSend('/crm/call-logs', {
      body: { donorUserId, requestId: requestId || undefined, outcome, note: note || undefined },
    });

    revalidateDashboard();

    return {
      ok: true,
      message: result.message ?? 'Call recorded.',
      callLog: result.callLog,
      history: result.history,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * The call history for one donor, fetched on demand.
 *
 * The worklist arrives with only the newest call per donor — loading forty full histories to
 * render a table would be forty queries for information nobody has asked to see. This is what
 * the expandable "recent calls" panel on a row calls when a staff member opens it, so the
 * question "how many times have we already tried this number?" is answerable in place, without
 * leaving the worklist to open the donor's page.
 *
 * A server action rather than a client fetch, for the usual reason: the access token stays in
 * an httpOnly cookie.
 */
export async function donorCallHistoryAction(donorUserId) {
  const staff = await requireSession();
  if (!canMarkDead(staff)) {
    return { ok: false, message: 'Your account cannot read call history.', code: 'FORBIDDEN' };
  }

  try {
    const result = await apiGet('/crm/call-logs', { donorUserId, take: 10 });
    return { ok: true, calls: result.calls };
  } catch (error) {
    return failure(error);
  }
}

// ---------------------------------------------------------------------------
// The lifecycle actions
// ---------------------------------------------------------------------------

/**
 * Marks a donor unreachable.
 *
 * The consequential one. On the backend this is a single transaction that sets status to DEAD,
 * increments tokenVersion (which kills every session the donor holds — see backend/docs/auth.md),
 * switches their availability off, and writes a MARKED_DEAD call log. The UI's job is to make
 * sure nobody presses it without knowing all of that, which is what the confirmation dialog in
 * ConfirmDialog.js is for.
 *
 * The backend returns an `effects` object describing exactly what changed. It is passed back
 * untouched so the UI can state the consequences in words rather than implying them with a
 * badge that quietly turns red.
 */
export async function markDeadAction({ userId, requestId, note }) {
  const staff = await requireSession();
  if (!canMarkDead(staff)) {
    return {
      ok: false,
      message: 'Your account cannot mark donors unreachable.',
      code: 'FORBIDDEN',
    };
  }

  try {
    const result = await apiSend(`/crm/donors/${encodeURIComponent(userId)}/mark-dead`, {
      body: { requestId: requestId || undefined, note: note || undefined },
    });

    revalidateDashboard();

    return {
      ok: true,
      message: result.message,
      user: result.user,
      callLog: result.callLog,
      history: result.history,
      effects: result.effects,
    };
  } catch (error) {
    return failure(error);
  }
}

/**
 * Puts a donor back — administrators only.
 *
 * Worth knowing before reading the UI: this does **not** restore the donor's session. The
 * tokenVersion bump from mark-dead is never rolled back, so a reactivated donor still signs in
 * again the next time they open the app. Rolling it back would hand a working session to
 * whoever is holding that phone now, which is the thing the bump was protecting against. The
 * dialog says so.
 */
export async function reactivateAction({ userId, note }) {
  const admin = await requireSession();
  if (!canReactivate(admin)) {
    return {
      ok: false,
      message: 'Only an administrator can reactivate a donor.',
      code: 'FORBIDDEN',
    };
  }

  try {
    const result = await apiSend(`/crm/donors/${encodeURIComponent(userId)}/reactivate`, {
      body: { note: note || undefined },
    });

    revalidateDashboard();

    return { ok: true, message: result.message, user: result.user, effects: result.effects };
  } catch (error) {
    return failure(error);
  }
}
