import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import FilterBar, { SelectFilter, TextFilter } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import BloodGroup from '@/components/ui/BloodGroup';
import { RequestStatusBadge, UrgencyBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { apiGet } from '@/lib/session';
import { BLOOD_GROUPS, PAGE_SIZE, REQUEST_STATUSES, URGENCIES } from '@/lib/constants';
import { formatArea, formatDateTime, formatRelative, pluralize } from '@/lib/format';

export const metadata = { title: 'Blood requests' };

const BASE_PATH = '/dashboard/requests';

/**
 * Every blood request in the system.
 *
 * `scope=all` is the staff view and the backend only grants it to STAFF and ADMIN — see
 * listRequests in requestService.js, which refuses the scope rather than silently narrowing
 * it. The default sort is most urgent first, then newest, which is the order a calling shift
 * should work through, so this page does not re-sort it.
 */
export default async function RequestsPage({ searchParams }) {
  const params = await searchParams;

  const filters = {
    status: single(params.status),
    bloodGroup: single(params.bloodGroup),
    urgency: single(params.urgency),
    state: single(params.state),
    district: single(params.district),
    city: single(params.city),
  };

  const page = pageNumber(single(params.page));

  const data = await apiGet('/requests', { scope: 'all', ...filters, page, pageSize: PAGE_SIZE });
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="Blood requests"
        description="Open a request to see its calling worklist — the nearby donors, nearest first."
      />

      <FilterBar
        action={BASE_PATH}
        legend="Filter blood requests"
        clearHref={hasFilters ? BASE_PATH : null}
        resultsLabel={`${pluralize(data.total, 'request')} matched`}
      >
        <SelectFilter
          label="Status"
          name="status"
          options={REQUEST_STATUSES}
          defaultValue={filters.status ?? ''}
        />
        <SelectFilter
          label="Blood group"
          name="bloodGroup"
          options={BLOOD_GROUPS}
          defaultValue={filters.bloodGroup ?? ''}
        />
        <SelectFilter label="Urgency" name="urgency" options={URGENCIES} defaultValue={filters.urgency ?? ''} />
        <TextFilter label="District" name="district" type="text" defaultValue={filters.district ?? ''} />
        <TextFilter label="City" name="city" type="text" defaultValue={filters.city ?? ''} />
        <TextFilter label="State" name="state" type="text" defaultValue={filters.state ?? ''} />
      </FilterBar>

      <p role="status" className="sr-only-focusable absolute">
        {pluralize(data.total, 'blood request')} found.
      </p>

      {data.results.length === 0 ? (
        <EmptyState
          title="No blood requests matched"
          message={
            hasFilters
              ? 'Try clearing a filter. Requests older than their expiry time are listed as expired, not open.'
              : 'No blood requests have been posted yet. They appear here the moment a receiver posts one in the app.'
          }
        />
      ) : (
        <>
          <DataTable caption="Blood requests matching the current filters" columns={COLUMNS} rows={data.results} />
          <Pagination
            basePath={BASE_PATH}
            params={filters}
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            hasMore={data.hasMore}
            noun="request"
          />
        </>
      )}
    </>
  );
}

function single(value) {
  const raw = Array.isArray(value) ? value[0] : value;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed || undefined;
}

function pageNumber(value) {
  const parsed = Number.parseInt(value ?? '1', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

const COLUMNS = [
  {
    key: 'hospital',
    header: 'Hospital',
    cell: (row) => (
      <>
        <Link
          href={`/dashboard/requests/${row.id}`}
          className="text-brand underline underline-offset-4 hover:text-brand-pressed"
        >
          {row.hospitalName || 'Unnamed hospital'}
        </Link>
        <span className="mt-0.5 block text-xs font-normal text-ink-muted">
          Posted by {row.requesterName || 'an app user'}
        </span>
      </>
    ),
  },
  {
    key: 'group',
    header: 'Blood group',
    cell: (row) => (
      <div className="flex items-center gap-2">
        <BloodGroup group={row.bloodGroup} />
        <span className="text-xs text-ink-muted">{row.unitsNeeded} units</span>
      </div>
    ),
  },
  { key: 'urgency', header: 'Urgency', cell: (row) => <UrgencyBadge urgency={row.urgency} /> },
  {
    key: 'status',
    header: 'Status',
    cell: (row) => (
      <div className="space-y-1">
        <RequestStatusBadge status={row.status} />
        {/* A row still stored as OPEN but past its expiry: requestView reports EXPIRED, and
            staff should know the difference between "closed" and "timed out". */}
        {row.isExpired && row.storedStatus === 'OPEN' ? (
          <span className="block text-xs text-ink-muted">Timed out, never closed</span>
        ) : null}
      </div>
    ),
  },
  {
    key: 'matches',
    header: 'Donors notified',
    numeric: true,
    cell: (row) => (row.matchCount === undefined ? '—' : row.matchCount),
  },
  {
    key: 'where',
    header: 'Location',
    cell: (row) => <span className="text-ink-muted">{formatArea(row.city, row.district, row.state)}</span>,
  },
  {
    key: 'posted',
    header: 'Posted',
    cell: (row) => (
      <span className="text-ink-muted">
        {formatDateTime(row.createdAt)}
        <span className="block text-xs">{formatRelative(row.createdAt)}</span>
      </span>
    ),
  },
];
