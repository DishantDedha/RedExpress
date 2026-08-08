/**
 * A single number on the dashboard home.
 *
 * Built as a definition list rather than a big <div> with a big font: the label and the value
 * are a pair, and marking them up as one means a screen reader reads "Open requests, 12"
 * instead of an orphaned "12" floating between headings.
 *
 * `tone` tints the number. It is never the only signal — the label always says what is being
 * counted, and anything that needs urgency gets a word in `hint`.
 */

const TONES = {
  default: 'text-ink',
  brand: 'text-brand',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

export default function StatTile({ label, value, hint, tone = 'default' }) {
  return (
    <div className="rounded-lg border border-line bg-card p-4 shadow-sm">
      <dt className="text-sm font-medium text-ink-muted">{label}</dt>
      <dd className={`mt-1 text-3xl font-bold tabular-nums ${TONES[tone] ?? TONES.default}`}>{value}</dd>
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
