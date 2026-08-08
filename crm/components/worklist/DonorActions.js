'use client';

import { useState, useTransition } from 'react';
import Button from '@/components/ui/Button';
import PhoneLink from '@/components/ui/PhoneLink';
import ConfirmDialog, { NoteField } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ToastProvider';
import { useSession } from '@/components/SessionProvider';
import { markDeadAction, reactivateAction, recordCallAction } from '@/lib/actions/crm';
import { canReactivate } from '@/lib/roles';

/**
 * What a staff member can do to one donor: ring them, say how it went, and — when the number
 * has stopped reaching anybody — take them out of circulation.
 *
 * The order of the controls is the order of the work. Call first, then the outcome, then the
 * last resort. "Mark as unreachable" is deliberately separated from the outcome buttons by a
 * divider and given the danger styling, because a mis-click there ends a donor's session.
 *
 * ## What this component does not decide
 *
 * Nothing here is authorization. `canReactivate` hides a button; the backend's
 * `requireRole('ADMIN')` is what actually refuses one. The server action re-checks as well, so
 * the rule is stated in three places and enforced in the one that counts.
 *
 * ## Reporting back
 *
 * Every action reports through `onChanged`, which the parent uses to update the row's status
 * badge and call history without a round trip. The server action also revalidates, so the
 * optimistic update and the authoritative data converge rather than diverging.
 */

const OUTCOMES = [
  { value: 'PICKED_UP', label: 'Picked up', hint: 'The donor answered.' },
  { value: 'NO_ANSWER', label: 'No answer', hint: 'Rang out or went to voicemail.' },
  { value: 'WRONG_NUMBER', label: 'Wrong number', hint: 'Someone else answered.' },
];

export default function DonorActions({
  donorUserId,
  donorName,
  phone,
  status,
  requestId = null,
  showCallLink = true,
  onChanged,
}) {
  const toast = useToast();
  const session = useSession();
  const [pending, startTransition] = useTransition();

  // Which control is working, so only that button shows a busy state — a whole row of
  // spinners tells nobody which action is in flight.
  const [busyAction, setBusyAction] = useState(null);
  const [dialog, setDialog] = useState(null); // 'mark-dead' | 'reactivate' | null
  const [note, setNote] = useState('');
  const [dialogError, setDialogError] = useState(null);

  const name = donorName || 'this donor';
  const isDead = status === 'DEAD';
  const isBlocked = status === 'BLOCKED';

  function closeDialog() {
    setDialog(null);
    setNote('');
    setDialogError(null);
  }

  function handleOutcome(outcome) {
    setBusyAction(outcome.value);

    startTransition(async () => {
      const result = await recordCallAction({ donorUserId, requestId, outcome: outcome.value });
      setBusyAction(null);

      if (!result.ok) {
        toast.error(result.message);
        return;
      }

      // Names the donor. On a worklist of forty rows, "Call recorded" alone leaves a
      // screen-reader user with no idea which row it belonged to.
      toast.success(`${outcome.label} recorded for ${name}.`);
      onChanged?.({ history: result.history, lastCall: result.callLog });
    });
  }

  function handleMarkDead() {
    setDialogError(null);
    setBusyAction('mark-dead');

    startTransition(async () => {
      const result = await markDeadAction({ userId: donorUserId, requestId, note });
      setBusyAction(null);

      if (!result.ok) {
        // Stays in the dialog. Closing it and dropping a toast would lose the note they typed
        // and leave them unsure whether anything happened.
        setDialogError(result.message);
        return;
      }

      closeDialog();
      toast.success(result.message, { title: 'Donor marked unreachable' });
      onChanged?.({ status: 'DEAD', history: result.history, lastCall: result.callLog });
    });
  }

  function handleReactivate() {
    setDialogError(null);
    setBusyAction('reactivate');

    startTransition(async () => {
      const result = await reactivateAction({ userId: donorUserId, note });
      setBusyAction(null);

      if (!result.ok) {
        setDialogError(result.message);
        return;
      }

      closeDialog();
      toast.success(result.message, { title: 'Donor reactivated' });
      onChanged?.({ status: 'ACTIVE' });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {showCallLink ? <PhoneLink phone={phone} name={name} /> : null}

      {/* A group, not loose buttons: a screen reader announces "Call outcome for Anita Sahu"
          before the three options, so the buttons are not three unattached verbs. */}
      <div role="group" aria-label={`Record call outcome for ${name}`} className="flex flex-wrap gap-2">
        {OUTCOMES.map((outcome) => (
          <Button
            key={outcome.value}
            variant="secondary"
            onClick={() => handleOutcome(outcome)}
            busy={busyAction === outcome.value}
            busyLabel="Saving…"
            disabled={pending && busyAction !== outcome.value}
            aria-label={`${outcome.label} — record this outcome for ${name}`}
            className="text-xs"
          >
            {outcome.label}
          </Button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2 border-t border-line pt-2">
        {isBlocked ? (
          <p className="text-xs text-ink-muted">
            This account is blocked. Marking it unreachable would change nothing.
          </p>
        ) : isDead ? (
          canReactivate(session) ? (
            <Button
              variant="secondary"
              onClick={() => setDialog('reactivate')}
              disabled={pending}
              aria-label={`Reactivate ${name}`}
              className="text-xs"
            >
              Reactivate
            </Button>
          ) : (
            // Not a disabled button. A control that cannot ever work for this account reads as
            // broken; a sentence explains the rule instead.
            <p className="text-xs text-ink-muted">
              Already marked unreachable. Only an administrator can reactivate a donor.
            </p>
          )
        ) : (
          <Button
            variant="danger"
            onClick={() => setDialog('mark-dead')}
            disabled={pending}
            aria-label={`Mark ${name} as unreachable`}
            className="text-xs"
          >
            Mark as unreachable
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={dialog === 'mark-dead'}
        title={`Mark ${name} as unreachable?`}
        confirmLabel="Yes, mark as unreachable"
        confirmBusyLabel="Marking…"
        busy={busyAction === 'mark-dead'}
        error={dialogError}
        onConfirm={handleMarkDead}
        onCancel={closeDialog}
        description={
          <>
            <p>This sets the donor to dead, which means:</p>
            {/* Spelled out rather than summarised. Every one of these is a consequence the
                staff member is choosing, and "dead" is jargon that explains none of them. */}
            <ul className="list-inside list-disc space-y-1">
              <li>they stop appearing in donor search;</li>
              <li>they stop receiving alerts when someone nearby needs blood;</li>
              <li>they are signed out on every device, and must log in again with a one-time
                password the next time they open the app.</li>
            </ul>
            <p>
              Signing in again puts them straight back to active. Use this when the number no longer
              reaches them — not for a donor who simply did not pick up today.
            </p>
          </>
        }
      >
        <NoteField
          value={note}
          onChange={setNote}
          disabled={busyAction === 'mark-dead'}
          label="Why? (optional)"
          hint="Saved to the audit trail, so whoever reads this record later knows what you heard."
        />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'reactivate'}
        title={`Reactivate ${name}?`}
        confirmLabel="Yes, reactivate"
        confirmBusyLabel="Reactivating…"
        variant="primary"
        busy={busyAction === 'reactivate'}
        error={dialogError}
        onConfirm={handleReactivate}
        onCancel={closeDialog}
        description={
          <>
            <p>
              This puts the donor back into search and notifications straight away. Use it when someone
              was marked unreachable by mistake.
            </p>
            <p>
              It does <strong>not</strong> sign them back in. Their old session stays ended, so they still
              log in again with a one-time password next time they open the app.
            </p>
          </>
        }
      >
        <NoteField
          value={note}
          onChange={setNote}
          disabled={busyAction === 'reactivate'}
          label="Why? (optional)"
          hint="Saved to the audit trail."
        />
      </ConfirmDialog>
    </div>
  );
}
