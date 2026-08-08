'use client';

/**
 * The one button in the CRM.
 *
 * Rules it enforces so no screen has to remember them:
 *   - real <button> with an explicit `type` (a bare button inside a form submits it, which is
 *     how "Call" ends up posting a search form),
 *   - 44px minimum height, so it is a comfortable target on a laptop trackpad,
 *   - a busy state that is *announced*, not just spun: `aria-busy` plus visible text that
 *     changes, because a spinner alone tells a screen-reader user nothing,
 *   - `disabled` while busy, so an impatient double-click cannot fire two "mark dead" calls.
 */

const VARIANTS = {
  primary: 'bg-brand text-white hover:bg-brand-pressed disabled:bg-ink-disabled',
  secondary: 'border border-line-strong bg-card text-ink hover:bg-surface disabled:text-ink-disabled',
  danger: 'bg-danger text-white hover:bg-brand-pressed disabled:bg-ink-disabled',
  quiet: 'text-brand underline underline-offset-4 hover:text-brand-pressed disabled:text-ink-disabled disabled:no-underline',
};

const SIZES = {
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-12 px-6 text-base',
};

export default function Button({
  children,
  type = 'button',
  variant = 'primary',
  size = 'md',
  busy = false,
  busyLabel = 'Working…',
  disabled = false,
  className = '',
  ...rest
}) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={[
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors',
        'disabled:cursor-not-allowed',
        VARIANTS[variant] ?? VARIANTS.primary,
        SIZES[size] ?? SIZES.md,
        className,
      ].join(' ')}
      {...rest}
    >
      {busy ? (
        <>
          <Spinner />
          {busyLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}

function Spinner() {
  // Decorative: the label beside it already carries the meaning.
  return (
    <span
      aria-hidden="true"
      className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent"
    />
  );
}
