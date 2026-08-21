import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import StatTile, { StatGrid } from '@/components/ui/StatTile';
import DataTable from '@/components/ui/DataTable';
import BloodGroup from '@/components/ui/BloodGroup';
import { UrgencyBadge, RequestStatusBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import { apiGet, requireSession } from '@/lib/session';
import { formatArea, formatDateTime, formatRelative, pluralize } from '@/lib/format';

export const metadata = { title: 'Dashboard' };

/**
 * The dashboard home: how much blood is reachable right now, and what is open.
 *
 * Two calls, issued together — the stats and the open-request list are independent, and
 * awaiting them in sequence would double the time to first paint on a page that is the first
 * thing every staff member opens.
 *
 * Everything here is `no-store` (see lib/api.js). A cached stat card on a dashboard whose
 * whole job is "who can we reach in the next hour" is worse than no stat card.
 */
export default async function DashboardPage() {
  const [user, stats, openRequests] = await Promise.all([
    requireSession(),
    apiGet('/crm/stats'),
    apiGet('/requests', { scope: 'all', status: 'OPEN', pageSize: 8 }),
  ]);

  const { donors, requests, today } = stats;

  return (
    <>
      <PageHeader
        banner
        eyebrow="Today"
        title={`Welcome, ${user.name || user.email}`}
        description="Donor availability at a glance, and the blood requests that are still open."
      />

      <section aria-labelledby="today-heading" className="mb-8">
        <h2 id="today-heading" className="mb-3 text-lg font-semibold text-ink">
          Right now
        </h2>

        <StatGrid label="Key numbers">
          <StatTile
            label="Open requests"
            value={requests.open}
            icon="clock"
            tone={requests.open > 0 ? 'brand' : 'default'}
            hint={
              requests.openCritical > 0
                ? `${pluralize(requests.openCritical, 'critical request')} among them`
                : 'None marked critical'
            }
          />
          <StatTile
            label="Active donors"
            value={donors.byStatus.ACTIVE}
            icon="people"
            tone="success"
            hint={`${donors.total} donor profiles in total`}
          />
          <StatTile
            label="Donors marked dead"
            value={donors.byStatus.DEAD}
            icon="alert"
            tone={donors.byStatus.DEAD > 0 ? 'warning' : 'default'}
            hint="Unreachable by phone. Hidden from search until they sign in again."
          />
          <StatTile
            label="Donors notified today"
            value={today.matches}
            icon="drop"
            hint={`${pluralize(today.accepted, 'acceptance')} so far`}
          />
        </StatGrid>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <section aria-labelledby="stock-heading" className="lg:col-span-2">
          <h2 id="stock-heading" className="mb-3 text-lg font-semibold text-ink">
            Donors by blood group
          </h2>

          <DataTable
            caption="Registered donors by blood group, showing how many are active and how many are switched on as available"
            columns={BLOOD_GROUP_COLUMNS}
            rows={donors.byBloodGroup}
            getRowKey={(row) => row.bloodGroup}
          />

          <p className="mt-2 text-sm text-ink-muted">
            Available means the donor is active and has their &ldquo;available to donate&rdquo; switch on. Only
            those donors are notified when a request is posted.
          </p>
        </section>

        <div className="space-y-6">
          <Card title="Today so far" description="Since midnight, in local time.">
            <dl className="space-y-2 text-sm">
              <Row label="Calls logged" value={today.calls} />
              <Row label="Donors notified" value={today.matches} />
              <Row label="Donors who accepted" value={today.accepted} />
              <Row label="Marked unreachable" value={today.markedDead} />
            </dl>
          </Card>

          <Card title="Requests" description="Across the whole system.">
            <dl className="space-y-2 text-sm">
              <Row label="Open" value={requests.byStatus.OPEN} />
              <Row label="Fulfilled" value={requests.byStatus.FULFILLED} />
              <Row label="Cancelled" value={requests.byStatus.CANCELLED} />
              <Row label="Expired" value={requests.byStatus.EXPIRED} />
            </dl>

            {requests.staleOpen > 0 ? (
              // Not decoration: rows still marked OPEN whose expiry has passed mean nobody is
              // closing requests out, and the open count above quietly disagrees with the list.
              <p className="mt-3 rounded-lg border border-warning bg-warning-tint p-2 text-sm text-ink">
                <span aria-hidden="true">▲ </span>
                {pluralize(requests.staleOpen, 'request')} still marked open but past the expiry time.
                They no longer notify donors.
              </p>
            ) : null}
          </Card>
        </div>
      </div>

      <section aria-labelledby="open-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="open-heading" className="text-lg font-semibold text-ink">
            Recent open requests
          </h2>
          <Link
            href="/dashboard/requests"
            className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-card px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            See all requests
          </Link>
        </div>

        {openRequests.results.length === 0 ? (
          <EmptyState
            title="No open blood requests"
            message="Nothing needs a calling list at the moment. New requests appear here as soon as they are posted."
          />
        ) : (
          <DataTable
            caption="Open blood requests, most urgent first"
            columns={REQUEST_COLUMNS}
            rows={openRequests.results}
          />
        )}
      </section>
    </>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="font-semibold tabular-nums text-ink">{value}</dd>
    </div>
  );
}

const BLOOD_GROUP_COLUMNS = [
  {
    key: 'group',
    header: 'Blood group',
    cell: (row) => <BloodGroup group={row.bloodGroup} />,
  },
  { key: 'total', header: 'Registered', numeric: true, cell: (row) => row.total },
  { key: 'active', header: 'Active', numeric: true, cell: (row) => row.active },
  {
    key: 'available',
    header: 'Available now',
    numeric: true,
    cell: (row) => (
      <span className={row.available === 0 ? 'font-semibold text-danger' : 'font-semibold text-ink'}>
        {row.available}
        {/* The zero is the thing worth noticing, and colour alone would not say so. */}
        {row.available === 0 ? <span className="sr-only-focusable absolute"> — none available</span> : null}
      </span>
    ),
  },
];

const REQUEST_COLUMNS = [
  {
    key: 'hospital',
    header: 'Hospital',
    cell: (row) => (
      <Link href={`/dashboard/requests/${row.id}`} className="text-brand underline underline-offset-4">
        {row.hospitalName || 'Unnamed hospital'}
      </Link>
    ),
  },
  { key: 'group', header: 'Blood group', cell: (row) => <BloodGroup group={row.bloodGroup} /> },
  { key: 'units', header: 'Units', numeric: true, cell: (row) => row.unitsNeeded },
  { key: 'urgency', header: 'Urgency', cell: (row) => <UrgencyBadge urgency={row.urgency} /> },
  { key: 'status', header: 'Status', cell: (row) => <RequestStatusBadge status={row.status} /> },
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
