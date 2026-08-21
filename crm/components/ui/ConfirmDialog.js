'use client';

import { useEffect, useId, useRef } from 'react';
import Button from '@/components/ui/Button';

/**
 * A modal confirmation, built on the native `<dialog>` element.
 *
 * Native rather than a div-with-a-fixed-position, because `showModal()` gives four things for
 * free that hand-rolled modals almost always get wrong:
 *
 *   - focus is trapped inside the dialog, so Tab cannot wander into the table behind it;
 *   - the rest of the page becomes inert — a screen reader cannot read past the dialog, which
 *     is the failure that makes a home-made modal invisible-but-present and deeply confusing;
 *   - Escape closes it;
 *   - focus returns to the button that opened it on close, so a keyboard user is put back where
 *     they were rather than at the top of the document.
 *
 * What is added on top:
 *   - `aria-labelledby` / `aria-describedby`, so the dialog announces its title *and* the
 *     consequence paragraph on open. For a destructive action the consequence is the point —
 *     it must be read, not sit on screen for a sighted user to notice.
 *   - Escape is disabled while the action is in flight. Closing the dialog mid-request would
 *     leave a staff member with no idea whether the donor was marked or not.
 *   - The confirm button is never the autofocused control. Focus lands on Cancel, so a stray
 *     Enter keypress on a dialog someone has not read yet does nothing.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  confirmBusyLabel = 'Working…',
  cancelLabel = 'Cancel',
  variant = 'danger',
  busy = false,
  error = null,
  children,
  onConfirm,
  onCancel,
}) {
  const dialogRef = useRef(null);
  const cancelRef = useRef(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // The 'cancel' event is Escape. Suppressing it while busy keeps the dialog and its progress
  // text on screen until the request settles.
  function handleCancel(event) {
    event.preventDefault();
    if (!busy) onCancel();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={handleCancel}
      // A click on the backdrop is not treated as a cancel. For a destructive confirmation the
      // only ways out should be deliberate ones: the button, or Escape.
      className="w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-card p-0 text-ink shadow-xl"
    >
      <form
        method="dialog"
        onSubmit={(event) => event.preventDefault()}
        className="flex flex-col gap-4 p-5"
      >
        <h2 id={titleId} className="text-lg font-bold text-ink">
          {title}
        </h2>

        {/* Plain words, no jargon. This is the sentence that decides whether the staff member
            understood what they are about to do. */}
        <div id={descriptionId} className="space-y-2 text-sm text-ink">
          {description}
        </div>

        {children}

        {error ? (
          <p role="alert" className="rounded-lg border border-danger bg-danger-tint p-3 text-sm font-medium text-ink">
            <span aria-hidden="true" className="mr-1.5 text-danger">
              ⚠
            </span>
            {error}
          </p>
        ) : null}

        <div className="mt-1 flex flex-wrap justify-end gap-3">
          <Button ref={cancelRef} type="button" variant="secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button type="button" variant={variant} busy={busy} busyLabel={confirmBusyLabel} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </form>
    </dialog>
  );
}

/**
 * The optional note attached to a sensitive action.
 *
 * Not required — a staff member on the phone should never be blocked from recording an outcome
 * by a mandatory text box — but always offered, because it is the only human explanation the
 * audit trail ever gets.
 */
export function NoteField({ value, onChange, label = 'Note (optional)', hint, disabled }) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}
      <textarea
        id={id}
        rows={3}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? hintId : undefined}
        maxLength={1000}
        className="rounded-lg border border-line-strong bg-card px-3 py-2 text-base text-ink"
      />
    </div>
  );
}
