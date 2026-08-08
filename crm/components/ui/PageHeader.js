/**
 * The <h1> for a dashboard page, plus optional actions.
 *
 * Exactly one of these per page. The dashboard layout gives the main region
 * `tabIndex={-1}` and the skip link points at it, so "skip to content" followed by one
 * screen-reader "next heading" lands on this title.
 */
export default function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-ink">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-sm text-ink-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
