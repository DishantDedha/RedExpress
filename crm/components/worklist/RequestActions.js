'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import Button from '@/components/ui/Button';
import ConfirmDialog, { NoteField } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ToastProvider';
import { updateRequestStatusAction } from '@/lib/actions/crm';

/**
 * Closing a request from the CRM — fulfilled or cancelled. Wired to the same
 * PATCH /requests/:id/status endpoint the requester's own app uses for the same action; staff
 * are simply another caller allowed to hit it (requestService.updateRequestStatus).
 */
export default function RequestActions({ requestId, status }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [dialog, setDialog] = useState(null); // 'FULFILLED' | 'CANCELLED' | null
  const [note, setNote] = useState('');
  const [dialogError, setDialogError] = useState(null);

  // Gated on the stored status, not the computed display status: a request whose stored
  // column is still OPEN but whose expiry has passed ("Timed out, never closed") should
  // still be closeable by staff — see requestService.updateRequestStatus.
  if (status !== 'OPEN') return null;

  function closeDialog() {
    setDialog(null);
    setNote('');
    setDialogError(null);
  }

  function handleConfirm() {
    const nextStatus = dialog;
    setDialogError(null);

    startTransition(async () => {
      const result = await updateRequestStatusAction({ requestId, status: nextStatus, note });

      if (!result.ok) {
        setDialogError(result.message);
        return;
      }

      closeDialog();
      toast.success(result.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="secondary" onClick={() => setDialog('FULFILLED')} disabled={pending}>
        Mark as fulfilled
      </Button>
      <Button variant="danger" onClick={() => setDialog('CANCELLED')} disabled={pending}>
        Cancel request
      </Button>

      <ConfirmDialog
        open={dialog === 'FULFILLED'}
        title="Mark this request as fulfilled?"
        confirmLabel="Yes, mark fulfilled"
        confirmBusyLabel="Saving…"
        variant="primary"
        busy={pending}
        error={dialogError}
        onConfirm={handleConfirm}
        onCancel={closeDialog}
        description={<p>Donors stop being alerted about this request. Use this once the blood has been found.</p>}
      >
        <NoteField value={note} onChange={setNote} disabled={pending} label="Note (optional)" />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'CANCELLED'}
        title="Cancel this request?"
        confirmLabel="Yes, cancel it"
        confirmBusyLabel="Saving…"
        busy={pending}
        error={dialogError}
        onConfirm={handleConfirm}
        onCancel={closeDialog}
        description={<p>Donors stop being alerted about this request. Use this when it is no longer needed.</p>}
      >
        <NoteField value={note} onChange={setNote} disabled={pending} label="Note (optional)" />
      </ConfirmDialog>
    </div>
  );
}
