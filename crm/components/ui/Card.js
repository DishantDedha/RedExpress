/**
 * A raised panel. Server component — it holds no state and should not cost a client bundle.
 *
 * `title` renders as a real heading so the page has an outline a screen reader can jump
 * through; `headingLevel` lets a caller keep that outline in order rather than scattering
 * <h2>s inside <h3> sections.
 */
export default function Card({ title, description, headingLevel = 2, actions, children, className = '' }) {
  const Heading = `h${headingLevel}`;

  return (
    <section className={`rounded-panel border border-line bg-card p-5 shadow-card ${className}`}>
      {(title || actions) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            {title ? <Heading className="text-base font-semibold text-ink">{title}</Heading> : null}
            {description ? <p className="mt-1 text-sm text-ink-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>
      )}
      {children}
    </section>
  );
}
