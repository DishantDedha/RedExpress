/**
 * The CRM's one table.
 *
 * A real <table> with a real <caption> and `scope="col"` headers, because that is what lets a
 * screen reader say "Phone, column 3" as someone arrows across a row. A grid built from divs
 * looks identical and reads as a wall of unlabelled text.
 *
 * Columns are declared as objects so every page gets the same header semantics for free:
 *
 *   { key: 'name', header: 'Name', cell: (row) => …, numeric?: true, srOnlyHeader?: true }
 *
 * `caption` is required. It is visually hidden by default but names the table for anyone
 * listing the page's tables, which is how a screen-reader user finds the one they want.
 *
 * Horizontal overflow scrolls inside the wrapper, and the wrapper is focusable (tabIndex 0)
 * with a role of "region" — a scrollable area that cannot be reached by keyboard is a
 * WCAG 2.1.1 failure, and this is the usual place it happens.
 */
export default function DataTable({ caption, captionVisible = false, columns, rows, getRowKey, rowClassName }) {
  return (
    <div
      role="region"
      aria-label={caption}
      tabIndex={0}
      className="overflow-x-auto rounded-panel border border-line bg-card shadow-card"
    >
      <table className="w-full border-collapse text-left text-sm">
        <caption
          className={
            captionVisible
              ? 'px-4 py-3 text-left text-sm font-semibold text-ink'
              : 'sr-only-focusable absolute'
          }
        >
          {caption}
        </caption>

        <thead>
          <tr className="border-b border-line-strong bg-blush">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={[
                  'px-4 py-3 text-xs font-semibold uppercase tracking-wide text-ink-muted',
                  column.numeric ? 'text-right' : 'text-left',
                  column.className ?? '',
                ].join(' ')}
              >
                {/* Some columns are pure controls ("Call"). The header still exists — it is
                    just not repeated on screen where the buttons speak for themselves. */}
                <span className={column.srOnlyHeader ? 'sr-only-focusable absolute' : undefined}>
                  {column.header}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, index) => (
            <tr
              key={getRowKey ? getRowKey(row, index) : (row.id ?? index)}
              className={[
                'border-b border-line transition-colors last:border-b-0 hover:bg-blush',
                rowClassName?.(row) ?? '',
              ].join(' ')}
            >
              {columns.map((column, columnIndex) => {
                // The first cell is the row's name — marking it a row header means a screen
                // reader repeats "Anita Sahu" as context while moving across the row, instead
                // of reading nine values belonging to nobody in particular.
                const Cell = columnIndex === 0 ? 'th' : 'td';

                return (
                  <Cell
                    key={column.key}
                    scope={columnIndex === 0 ? 'row' : undefined}
                    className={[
                      'px-4 py-3 align-top',
                      columnIndex === 0 ? 'font-semibold text-ink' : 'font-normal text-ink',
                      column.numeric ? 'text-right tabular-nums' : 'text-left',
                    ].join(' ')}
                  >
                    {column.cell(row)}
                  </Cell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
