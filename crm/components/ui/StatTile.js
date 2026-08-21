import Icon from '@/components/ui/Icon';

/**
 * A single number on the dashboard home.
 *
 * Built as a definition list rather than a big <div> with a big font: the label and the value
 * are a pair, and marking them up as one means a screen reader reads "Open requests, 12"
 * instead of an orphaned "12" floating between headings.
 *
 * ## Tone is never the signal
 *
 * `tone` tints the number, the icon disc and a rule down the left edge. None of that is
 * information: the label always says what is being counted, and anything that needs urgency
 * gets a word in `hint`. The three visual treatments move together so that a tile reads as
 * "the notable one" at a glance — and reads exactly the same in greyscale, where it is the
 * hint that carries it.
 *
 * The left rule is a `border-l-4` rather than a coloured background. A tinted tile would put
 * a 3xl number on a coloured field and force every tone to be re-measured against it; a rule
 * is decoration beside white, and the number keeps the contrast it was checked at.
 *
 * `icon` is optional and, like every icon in this app, decorative — see `Icon`.
 */

const TONES = {
  default: {
    value: 'text-ink',
    rule: 'border-l-line',
    disc: 'bg-surface text-ink-muted',
  },
  brand: {
    value: 'text-brand',
    rule: 'border-l-brand',
    disc: 'bg-brand-tint text-brand-ink',
  },
  success: {
    value: 'text-success',
    rule: 'border-l-success',
    disc: 'bg-success-tint text-success',
  },
  warning: {
    value: 'text-warning',
    rule: 'border-l-warning',
    disc: 'bg-warning-tint text-warning',
  },
  danger: {
    value: 'text-danger',
    rule: 'border-l-danger',
    disc: 'bg-danger-tint text-danger',
  },
};

export default function StatTile({ label, value, hint, tone = 'default', icon }) {
  const palette = TONES[tone] ?? TONES.default;

  return (
    <div
      className={`rounded-panel border border-line border-l-4 bg-card p-4 shadow-card ${palette.rule}`}
    >
      <div className="flex items-start justify-between gap-3">
        <dt className="text-sm font-medium text-ink-muted">{label}</dt>
        {icon ? (
          <span
            aria-hidden="true"
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${palette.disc}`}
          >
            <Icon name={icon} />
          </span>
        ) : null}
      </div>

      <dd className={`mt-2 text-3xl font-bold tabular-nums ${palette.value}`}>{value}</dd>
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </div>
  );
}

/** The <dl> the tiles live in. */
export function StatGrid({ label, children, columns = 'md:grid-cols-4' }) {
  return (
    <dl aria-label={label} className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${columns}`}>
      {children}
    </dl>
  );
}
