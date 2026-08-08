import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import DataTable from '@/components/ui/DataTable';
import FilterBar, { SelectFilter, TextFilter } from '@/components/ui/FilterBar';
import Pagination from '@/components/ui/Pagination';
import StatusBadge from '@/components/ui/StatusBadge';
import BloodGroup from '@/components/ui/BloodGroup';
import PhoneLink from '@/components/ui/PhoneLink';
import { AvailabilityBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { LastCallCell } from '@/components/CallHistory';
import { apiGet } from '@/lib/session';
import { BLOOD_GROUPS, PAGE_SIZE, ROLES, USER_STATUSES } from '@/lib/constants';
import { formatArea, pluralize } from '@/lib/format';

export const metadata = { title: 'People' };

const BASE_PATH = '/dashboard/users';

/**
 * The people finder — one search box across name, phone and email, plus filters.
 *
 * The filters live in the URL, not in component state (see FilterBar for why). This page reads
 * them back out of `searchParams` and hands them straight to /crm/users/search; the backend's
 * zod schema is the validator, so nothing is re-checked here except the page number, which
 * has to be a positive integer before it can be used as an offset.
 */
export default async function UsersPage({ searchParams }) {
  const params = await searchParams;

  const filters = {
    q: single(params.q),
    role: single(params.role),
    status: single(params.status),
    bloodGroup: single(params.bloodGroup),
    state: single(params.state),
    district: single(params.district),
    city: single(params.city),
  };

  const page = pageNumber(single(params.page));

  const data = await apiGet('/crm/users/search', { ...filters, page, pageSize: PAGE_SIZE });
  const hasFilters = Object.values(filters).some(Boolean);

  return (
    <>
      <PageHeader
        title="People"
        description="Search donors, receivers and staff by name, phone number or email address."
      />

      <FilterBar
        action={BASE_PATH}
        legend="Search and filter people"
        clearHref={hasFilters ? BASE_PATH : null}
        resultsLabel={`${pluralize(data.total, 'person', 'people')} matched`}
      >
        <TextFilter
          label="Name, phone or email"
          name="q"
          defaultValue={filters.q ?? ''}
          placeholder="e.g. Anita, 9876500001"
          hint="Part of a phone number works too."
        />
        <SelectFilter label="Role" name="role" options={ROLES} defaultValue={filters.role ?? ''} />
        <SelectFilter
          label="Status"
          name="status"
          options={USER_STATUSES}
          defaultValue={filters.status ?? ''}
        />
        <SelectFilter
          label="Blood group"
          name="bloodGroup"
          options={BLOOD_GROUPS}
          defaultValue={filters.bloodGroup ?? ''}
        />
        <TextFilter label="State" name="state" type="text" defaultValue={filters.state ?? ''} />
        <TextFilter label="District" name="district" type="text" defaultValue={filters.district ?? ''} />
        <TextFilter label="City" name="city" type="text" defaultValue={filters.city ?? ''} />
      </FilterBar>

      {/* The result count is announced as well as shown. A screen-reader user who submits the
          form otherwise gets no signal that anything changed. */}
      <p role="status" className="sr-only-focusable absolute">
        {pluralize(data.total, 'person', 'people')} found.
      </p>

      {data.results.length === 0 ? (
        <EmptyState
          title="Nobody matched that search"
          message={
            hasFilters
              ? 'Try a shorter search term, or clear a filter. Phone numbers can be searched by their last few digits.'
              : 'There are no people registered yet. Donors appear here as soon as they finish signing up in the app.'
          }
        />
      ) : (
        <>
          <DataTable caption="People matching the current filters" columns={COLUMNS} rows={data.results} />
          <Pagination
            basePath={BASE_PATH}
            params={filters}
            page={data.page}
            pageSize={data.pageSize}
            total={data.total}
            hasMore={data.hasMore}
            noun="person"
            nounPlural="people"
          />
        </>
      )}
    </>
  );
}

/** A repeated query param arrives as an array; take the first and ignore the rest. */
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
    key: 'name',
    header: 'Name',
    cell: (row) => (
      <>
        <Link
          href={`/dashboard/users/${row.id}`}
          className="text-brand underline underline-offset-4 hover:text-brand-pressed"
        >
          {row.name || 'Name not given'}
        </Link>
        <span className="mt-0.5 block text-xs font-normal text-ink-muted">{row.role.toLowerCase()}</span>
        {/* A donor row with no DonorProfile is a half-finished signup, not a data error.
            Saying so stops staff hunting for a blood group that was never entered. */}
        {row.profileComplete ? null : (
          <span className="mt-0.5 block text-xs font-normal text-warning">Registration not finished</span>
        )}
      </>
    ),
  },
  {
    key: 'phone',
    header: 'Phone',
    cell: (row) => <PhoneLink phone={row.phone} name={row.name || 'this person'} />,
  },
  { key: 'bloodGroup', header: 'Blood group', cell: (row) => <BloodGroup group={row.bloodGroup} /> },
  {
    key: 'location',
    header: 'Location',
    cell: (row) => <span className="text-ink-muted">{formatArea(row.city, row.district, row.state)}</span>,
  },
  {
    key: 'status',
    header: 'Status',
    cell: (row) => (
      <div className="space-y-1">
        <StatusBadge status={row.status} showHint />
        {row.role === 'DONOR' ? <AvailabilityBadge isAvailable={row.isAvailable} /> : null}
      </div>
    ),
  },
  {
    key: 'lastCall',
    header: 'Last call',
    cell: (row) => <LastCallCell lastCall={row.lastCall} callCount={row.callCount} />,
  },
];
