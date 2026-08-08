'use client';

import { useId } from 'react';

/**
 * A labelled text input with its error wired up.
 *
 * The label is a real <label>, never a placeholder standing in for one — a placeholder
 * disappears the moment someone types, and is skipped entirely by some screen readers, so a
 * form built on placeholders leaves a low-vision user staring at anonymous boxes.
 *
 * The error message is linked with aria-describedby and marked aria-invalid, so it is read as
 * part of the field rather than sitting somewhere below it as red text nobody hears.
 *
 * A `ref` passed in lands on the <input> via `...rest` — React 19 hands `ref` to function
 * components as an ordinary prop, so no forwardRef wrapper is needed. Callers use it to move
 * focus to the first invalid field on submit.
 */
export default function Field({ label, error, hint, id, type = 'text', required = false, ...rest }) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const errorId = `${fieldId}-error`;
  const hintId = `${fieldId}-hint`;

  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={fieldId} className="text-sm font-semibold text-ink">
        {label}
        {required ? (
          <>
            {' '}
            {/* "required" as a word, not a bare asterisk whose meaning lives in a legend
                somewhere else on the page. */}
            <span className="font-normal text-ink-muted">(required)</span>
          </>
        ) : null}
      </label>

      {hint ? (
        <p id={hintId} className="text-sm text-ink-muted">
          {hint}
        </p>
      ) : null}

      <input
        id={fieldId}
        type={type}
        required={required}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        className={[
          'min-h-11 rounded-md border bg-card px-3 text-base text-ink placeholder:text-ink-muted',
          error ? 'border-danger' : 'border-line-strong',
        ].join(' ')}
        {...rest}
      />

      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm font-medium text-danger">
          <span aria-hidden="true">⚠</span>
          {error}
        </p>
      ) : null}
    </div>
  );
}
