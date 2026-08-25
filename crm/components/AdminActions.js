'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import Button from '@/components/ui/Button';
import Field from '@/components/ui/Field';
import ConfirmDialog, { NoteField } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/components/ToastProvider';
import { useSession } from '@/components/SessionProvider';
import { deleteUserAction, setUserStatusAction, updateUserAction } from '@/lib/actions/crm';
import { isAdmin, isStaff } from '@/lib/roles';
import { BLOOD_GROUPS } from '@/lib/constants';

/**
 * Record management: edit, suspend/unsuspend, delete.
 *
 * Separate from DonorRecordPanel on purpose. That component is the ACTIVE <-> DEAD loop —
 * a report from the phones about whether a number still reaches someone, and self-
 * recoverable by the donor re-verifying. Everything here is administrative and NOT
 * self-recoverable: editing a record, blocking an account outright, deleting one. Edit and
 * delete are ADMIN-only; suspending follows the same STAFF/ADMIN split mark-dead does, and
 * unsuspending follows the same ADMIN-only split reactivate does — see crmAdminService.js.
 */
export default function AdminActions({ user, donorProfile }) {
  const router = useRouter();
  const toast = useToast();
  const session = useSession();
  const [pending, startTransition] = useTransition();

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(() => initialValues(user, donorProfile));
  const [fieldErrors, setFieldErrors] = useState({});

  const [dialog, setDialog] = useState(null); // 'suspend' | 'unsuspend' | 'delete' | null
  const [note, setNote] = useState('');
  const [dialogError, setDialogError] = useState(null);
  const [busyAction, setBusyAction] = useState(null);

  const name = user.name || 'this person';
  const isDonor = user.role === 'DONOR';
  const blocked = user.status === 'BLOCKED';

  function closeDialog() {
    setDialog(null);
    setNote('');
    setDialogError(null);
  }

  function beginEdit() {
    setValues(initialValues(user, donorProfile));
    setFieldErrors({});
    setEditing(true);
  }

  function handleSaveEdit() {
    setFieldErrors({});
    setBusyAction('save');

    startTransition(async () => {
      const result = await updateUserAction({ userId: user.id, ...values });
      setBusyAction(null);

      if (!result.ok) {
        setFieldErrors(result.fields ?? {});
        toast.error(result.message);
        return;
      }

      setEditing(false);
      toast.success(result.message);
      router.refresh();
    });
  }

  function handleSuspend() {
    setDialogError(null);
    setBusyAction('suspend');

    startTransition(async () => {
      const result = await setUserStatusAction({ userId: user.id, status: 'BLOCKED', note });
      setBusyAction(null);

      if (!result.ok) {
        setDialogError(result.message);
        return;
      }

      closeDialog();
      toast.success(result.message, { title: 'Account blocked' });
      router.refresh();
    });
  }

  function handleUnsuspend() {
    setDialogError(null);
    setBusyAction('unsuspend');

    startTransition(async () => {
      const result = await setUserStatusAction({ userId: user.id, status: 'ACTIVE', note });
      setBusyAction(null);

      if (!result.ok) {
        setDialogError(result.message);
        return;
      }

      closeDialog();
      toast.success(result.message, { title: 'Account unblocked' });
      router.refresh();
    });
  }

  function handleDelete() {
    setDialogError(null);
    setBusyAction('delete');

    startTransition(async () => {
      const result = await deleteUserAction({ userId: user.id, note });
      setBusyAction(null);

      if (!result.ok) {
        setDialogError(result.message);
        return;
      }

      toast.success(result.message, { title: 'Person deleted' });
      router.push('/dashboard/users');
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {isAdmin(session) ? (
          <Button variant="secondary" size="md" onClick={editing ? () => setEditing(false) : beginEdit} disabled={pending}>
            {editing ? 'Cancel editing' : 'Edit record'}
          </Button>
        ) : null}

        {blocked ? (
          isAdmin(session) ? (
            <Button variant="secondary" onClick={() => setDialog('unsuspend')} disabled={pending}>
              Unblock account
            </Button>
          ) : (
            <p className="self-center text-xs text-ink-muted">Blocked. Only an administrator can unblock this account.</p>
          )
        ) : isStaff(session) ? (
          <Button variant="danger" onClick={() => setDialog('suspend')} disabled={pending}>
            Block account
          </Button>
        ) : null}

        {isAdmin(session) ? (
          <Button variant="danger" onClick={() => setDialog('delete')} disabled={pending}>
            Delete record
          </Button>
        ) : null}
      </div>

      {editing ? (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Full name"
              value={values.fullName}
              onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))}
              error={fieldErrors.fullName}
            />
            <Field
              label="Email address"
              type="email"
              value={values.email}
              onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
              error={fieldErrors.email}
            />

            {isDonor ? (
              <>
                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-ink" htmlFor="edit-bloodGroup">
                    Blood group
                  </label>
                  <select
                    id="edit-bloodGroup"
                    value={values.bloodGroup}
                    onChange={(e) => setValues((v) => ({ ...v, bloodGroup: e.target.value }))}
                    className="min-h-11 rounded-lg border border-line-strong bg-card px-3 text-base text-ink"
                  >
                    {BLOOD_GROUPS.map((group) => (
                      <option key={group.value} value={group.value}>
                        {group.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-sm font-semibold text-ink" htmlFor="edit-gender">
                    Gender
                  </label>
                  <select
                    id="edit-gender"
                    value={values.gender}
                    onChange={(e) => setValues((v) => ({ ...v, gender: e.target.value }))}
                    className="min-h-11 rounded-lg border border-line-strong bg-card px-3 text-base text-ink"
                  >
                    <option value="MALE">Male</option>
                    <option value="FEMALE">Female</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                <Field
                  label="Weight (kilograms)"
                  type="number"
                  value={values.weight}
                  onChange={(e) => setValues((v) => ({ ...v, weight: e.target.value }))}
                  error={fieldErrors.weight}
                />
                <Field
                  label="Emergency contact"
                  value={values.emergencyContact}
                  onChange={(e) => setValues((v) => ({ ...v, emergencyContact: e.target.value }))}
                  error={fieldErrors.emergencyContact}
                />
                <Field
                  label="State"
                  value={values.state}
                  onChange={(e) => setValues((v) => ({ ...v, state: e.target.value }))}
                  error={fieldErrors.state}
                />
                <Field
                  label="District"
                  value={values.district}
                  onChange={(e) => setValues((v) => ({ ...v, district: e.target.value }))}
                  error={fieldErrors.district}
                />
                <Field
                  label="City"
                  value={values.city}
                  onChange={(e) => setValues((v) => ({ ...v, city: e.target.value }))}
                  error={fieldErrors.city}
                />
                <Field
                  label="PIN code"
                  value={values.pincode}
                  onChange={(e) => setValues((v) => ({ ...v, pincode: e.target.value }))}
                  error={fieldErrors.pincode}
                />
                <div className="sm:col-span-2">
                  <Field
                    label="Address"
                    value={values.address}
                    onChange={(e) => setValues((v) => ({ ...v, address: e.target.value }))}
                    error={fieldErrors.address}
                  />
                </div>
              </>
            ) : null}
          </div>

          <Button
            variant="primary"
            className="mt-4"
            busy={busyAction === 'save'}
            busyLabel="Saving…"
            onClick={handleSaveEdit}
          >
            Save changes
          </Button>
        </div>
      ) : null}

      <ConfirmDialog
        open={dialog === 'suspend'}
        title={`Block ${name}?`}
        confirmLabel="Yes, block this account"
        confirmBusyLabel="Blocking…"
        busy={busyAction === 'suspend'}
        error={dialogError}
        onConfirm={handleSuspend}
        onCancel={closeDialog}
        description={
          <>
            <p>Unlike marking a donor unreachable, this is not self-recoverable:</p>
            <ul className="list-inside list-disc space-y-1">
              <li>they are signed out on every device immediately;</li>
              <li>signing in again with a one-time password does not undo it;</li>
              <li>only an administrator can unblock the account.</li>
            </ul>
          </>
        }
      >
        <NoteField value={note} onChange={setNote} disabled={busyAction === 'suspend'} label="Why? (optional)" />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'unsuspend'}
        title={`Unblock ${name}?`}
        confirmLabel="Yes, unblock"
        confirmBusyLabel="Unblocking…"
        variant="primary"
        busy={busyAction === 'unsuspend'}
        error={dialogError}
        onConfirm={handleUnsuspend}
        onCancel={closeDialog}
        description={<p>This lets them sign in again. They still need to sign in with a fresh one-time password.</p>}
      >
        <NoteField value={note} onChange={setNote} disabled={busyAction === 'unsuspend'} label="Why? (optional)" />
      </ConfirmDialog>

      <ConfirmDialog
        open={dialog === 'delete'}
        title={`Delete ${name}?`}
        confirmLabel="Yes, delete permanently"
        confirmBusyLabel="Deleting…"
        busy={busyAction === 'delete'}
        error={dialogError}
        onConfirm={handleDelete}
        onCancel={closeDialog}
        description={
          <>
            <p>
              This permanently removes their account, profile, blood requests and match history. It cannot
              be undone.
            </p>
          </>
        }
      >
        <NoteField value={note} onChange={setNote} disabled={busyAction === 'delete'} label="Why? (optional)" />
      </ConfirmDialog>
    </div>
  );
}

function initialValues(user, donorProfile) {
  return {
    fullName: user.name ?? '',
    email: user.email ?? '',
    bloodGroup: donorProfile?.bloodGroup ?? 'O_POS',
    gender: donorProfile?.gender ?? 'MALE',
    weight: donorProfile?.weight ?? '',
    emergencyContact: donorProfile?.emergencyContact ?? '',
    state: donorProfile?.state ?? '',
    district: donorProfile?.district ?? '',
    city: donorProfile?.city ?? '',
    pincode: donorProfile?.pincode ?? '',
    address: donorProfile?.address ?? '',
  };
}
