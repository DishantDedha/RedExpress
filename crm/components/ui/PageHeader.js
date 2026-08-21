/**
 * The <h1> for a dashboard page, plus optional actions.
 *
 * Exactly one of these per page. The dashboard layout gives the main region `tabIndex={-1}`
 * and the skip link points at it, so "skip to content" followed by one screen-reader "next
 * heading" lands on this title.
 *
 * ## The two forms
 *
 * The default is a plain title on the page background — right for a page whose job is to get
 * out of the way of a table.
 *
 * `banner` draws it on the brand ramp instead. It is for the dashboard home, which is the
 * one page a staff member opens to orient rather than to work, and it is deliberately not
 * used anywhere else: a red band above every table would be a masthead repeated six times a
 * shift, and the rail already carries the brand on every page.
 *
 * Both stops of the ramp carry white above 4.5:1 on their own (6.30:1 and 12.84:1), so the
 * title and the description are AA wherever the gradient happens to be under them — see
 * `.brand-band` in globals.css. `eyebrow` is capitals for the look and is hidden from screen
 * readers: short all-caps strings get spelled out letter by letter, and the title below it
 * says the same thing in words.
 */
export default function PageHeader({ title, description, eyebrow, actions, banner = false }) {
  if (banner) {
    return (
      <div className="brand-band mb-6 rounded-panel p-6 shadow-raised md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow ? (
              <p
                aria-hidden="true"
                className="mb-1 text-xs font-bold uppercase tracking-widest text-on-brand-muted"
              >
                {eyebrow}
              </p>
            ) : null}

            <h1 className="text-2xl font-bold text-white md:text-3xl">{title}</h1>

            {description ? (
              <p className="mt-2 max-w-2xl text-sm text-on-brand-muted">{description}</p>
            ) : null}
          </div>

          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        {eyebrow ? (
          <p aria-hidden="true" className="mb-1 text-xs font-bold uppercase tracking-widest text-brand">
            {eyebrow}
          </p>
        ) : null}

        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
