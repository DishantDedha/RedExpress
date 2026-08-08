import Link from 'next/link';

/**
 * The search and filter form above a table.
 *
 * A plain GET <form>. No client component, no debounced fetch, no state to get out of sync:
 * submitting navigates to the same page with new query params and the server component
 * re-renders. That buys three things worth more than instant filtering —
 *
 *   - it works before (and without) the JS bundle, which matters on the hospital-grade laptops
 *     this dashboard runs on;
 *   - the resulting URL is the search, so staff can bookmark "open critical requests in
 *     Cuttack" or paste it to a colleague;
 *   - a screen-reader user fills the form and presses Enter, exactly like every other form,
 *     rather than fighting results that reshuffle under them on every keystroke.
 *
 * `page` is deliberately not carried forward: changing a filter must return to page 1, or
 * narrowing a search from page 4 shows an empty table.
 */
export default function FilterBar({ action, children, resultsLabel, clearHref, legend = 'Filters' }) {
  return (
    <form method="get" action={action} className="mb-4 rounded-lg border border-line bg-card p-4">
      <fieldset>
        {/* Names the group of controls for screen readers; the visible heading is the page's. */}
        <legend className="sr-only-focusable absolute">{legend}</legend>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{children}</div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-pressed"
          >
            Apply filters
          </button>

          {clearHref ? (
            <Link
              href={clearHref}
              className="inline-flex min-h-11 items-center rounded-md border border-line-strong bg-card px-4 text-sm font-semibold text-ink hover:bg-surface"
            >
              Clear all filters
            </Link>
          ) : null}

          {resultsLabel ? <p className="text-sm text-ink-muted">{resultsLabel}</p> : null}
        </div>
      </fieldset>
    </form>
  );
}

/**
 * A labelled <select> for the filter bar.
 *
 * The empty option reads "Any blood group", not "All" or a blank line: heard on its own,
 * "Any blood group" says what the control does and what its current value means.
 */
export function SelectFilter({ label, name, options, defaultValue = '', anyLabel }) {
  const id = `filter-${name}`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-semibold text-ink">
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue}
        className="min-h-11 rounded-md border border-line-strong bg-card px-3 text-base text-ink"
      >
        <option value="">{anyLabel ?? `Any ${label.toLowerCase()}`}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A labelled text input for the filter bar. Same shape as Field, minus the error plumbing. */
export function TextFilter({ label, name, defaultValue = '', placeholder, hint, type = 'search' }) {
  const id = `filter-${name}`;
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
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-describedby={hint ? hintId : undefined}
        className="min-h-11 rounded-md border border-line-strong bg-card px-3 text-base text-ink placeholder:text-ink-muted"
      />
    </div>
  );
}
