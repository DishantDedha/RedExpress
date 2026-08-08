/**
 * Label/value pairs on a detail page.
 *
 * A real <dl>: screen readers pair each term with its description, so "Blood group, O
 * negative" arrives as one fact. Two columns of divs would read as an alternating list of
 * nouns and values and leave the listener to guess the pairing.
 *
 * Items are `{ label, value, span? }`. A falsy value renders the fallback rather than an empty
 * space — see lib/format.js on why blanks are not allowed.
 */
export default function DetailList({ items, label, columns = 'sm:grid-cols-2' }) {
  return (
    <dl aria-label={label} className={`grid grid-cols-1 gap-x-6 gap-y-4 ${columns}`}>
      {items
        .filter((item) => item)
        .map((item) => (
          <div key={item.label} className={item.span ? 'sm:col-span-2' : undefined}>
            <dt className="text-xs font-semibold uppercase tracking-wide text-ink-muted">{item.label}</dt>
            <dd className="mt-1 text-sm text-ink">
              {item.value === null || item.value === undefined || item.value === '' ? (
                <span className="text-ink-muted">Not recorded</span>
              ) : (
                item.value
              )}
            </dd>
          </div>
        ))}
    </dl>
  );
}
