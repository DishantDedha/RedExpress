import Link from 'next/link';
import { pluralize } from '@/lib/format';

/**
 * Previous / next paging, built from links rather than buttons.
 *
 * Links mean the browser Back button works, a page of results can be bookmarked or pasted to a
 * colleague, and paging costs no client JavaScript. Every current filter is carried through in
 * the query string, so moving to page 2 never silently widens a search.
 *
 * The result count is announced: `role="status"` on the summary means a screen-reader user
 * hears "Showing 21 to 40 of 137 people" when the new page renders, which is the whole point
 * of pagination and is otherwise invisible to them.
 *
 * @param {object} props
 * @param {string} props.basePath   e.g. '/dashboard/users'
 * @param {object} props.params     current query params, page included
 * @param {number} props.page       1-based
 * @param {number} props.pageSize
 * @param {number} props.total
 * @param {boolean} props.hasMore
 * @param {string} props.noun       what is being counted, e.g. 'person'
 */
export default function Pagination({ basePath, params, page, pageSize, total, hasMore, noun = 'result', nounPlural }) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const href = (targetPage) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (key !== 'page' && value !== undefined && value !== null && value !== '') {
        search.set(key, String(value));
      }
    }
    if (targetPage > 1) search.set('page', String(targetPage));
    const query = search.toString();
    return query ? `${basePath}?${query}` : basePath;
  };

  return (
    <nav
      aria-label={`${noun} pages`}
      className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm"
    >
      <p role="status" className="text-ink-muted">
        {total === 0
          ? `No ${nounPlural ?? `${noun}s`} found`
          : `Showing ${first} to ${last} of ${pluralize(total, noun, nounPlural)}`}
      </p>

      <div className="flex items-center gap-2">
        <PageLink href={href(page - 1)} disabled={page <= 1}>
          <span aria-hidden="true">←</span> Previous page
        </PageLink>

        <span className="px-2 text-ink-muted">Page {page}</span>

        <PageLink href={href(page + 1)} disabled={!hasMore}>
          Next page <span aria-hidden="true">→</span>
        </PageLink>
      </div>
    </nav>
  );
}

/**
 * A disabled link is not a thing in HTML, so the unavailable direction renders as plain text
 * marked aria-disabled — it stays in the reading order (so its absence is not confusing) but
 * out of the tab order, and cannot be followed.
 */
function PageLink({ href, disabled, children }) {
  const shared = 'inline-flex min-h-11 items-center gap-1.5 rounded-md border px-3 font-semibold';

  if (disabled) {
    return (
      <span aria-disabled="true" className={`${shared} border-line bg-surface text-ink-disabled`}>
        {children}
      </span>
    );
  }

  return (
    <Link href={href} className={`${shared} border-line-strong bg-card text-ink hover:bg-surface`}>
      {children}
    </Link>
  );
}
