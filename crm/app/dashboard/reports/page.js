import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import DataTable from '@/components/ui/DataTable';
import BloodGroup from '@/components/ui/BloodGroup';
import StatTile, { StatGrid } from '@/components/ui/StatTile';
import { EmptyState } from '@/components/ui/States';
import { apiGet } from '@/lib/session';
import { formatDateTime, pluralize } from '@/lib/format';

export const metadata = { title: 'Reports' };

/**
 * Total donors, district-wise donors, blood-group-wise donors, monthly registrations, and
 * completed requests — one call to /crm/reports (crmReports in crmService.js), rendered as
 * four tables so a staff member can scan or screenshot any one of them on its own.
 *
 * Blood-group totals also appear on the dashboard home; they are repeated here because this
 * is the page a staff member reaches for when asked for "the numbers", and it should not
 * send them back to the dashboard for a third of the answer.
 */
export default async function ReportsPage() {
  const data = await apiGet('/crm/reports');
  const { donorsByDistrict, donorsByBloodGroup, monthlyRegistrations, completedRequests } = data;

  const totalDonors = donorsByBloodGroup.reduce((sum, row) => sum + row.donors, 0);
  const totalDistricts = donorsByDistrict.length;

  return (
    <>
      <PageHeader
        title="Reports"
        description="Donors by district and blood group, registrations over time, and completed requests."
      />

      <div className="mb-8">
        <StatGrid label="Report totals">
          <StatTile label="Total donors" value={totalDonors} icon="people" />
          <StatTile label="Districts represented" value={totalDistricts} icon="grid" />
          <StatTile label="Completed requests" value={completedRequests.total} icon="check" tone="success" />
        </StatGrid>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="district-heading">
          <h2 id="district-heading" className="mb-3 text-lg font-semibold text-ink">
            Donors by district
          </h2>
          {donorsByDistrict.length === 0 ? (
            <EmptyState title="No donors yet" message="Donors appear here as soon as they register in the app." />
          ) : (
            <DataTable
              caption="Active donors grouped by state and district, most donors first"
              columns={DISTRICT_COLUMNS}
              rows={donorsByDistrict}
              getRowKey={(row) => `${row.state}-${row.district}`}
            />
          )}
        </section>

        <section aria-labelledby="group-heading">
          <h2 id="group-heading" className="mb-3 text-lg font-semibold text-ink">
            Donors by blood group
          </h2>
          <DataTable
            caption="All registered donors, by blood group"
            columns={GROUP_COLUMNS}
            rows={donorsByBloodGroup}
            getRowKey={(row) => row.bloodGroup}
          />
        </section>
      </div>

      <section aria-labelledby="monthly-heading" className="mt-8">
        <h2 id="monthly-heading" className="mb-3 text-lg font-semibold text-ink">
          Monthly registrations
        </h2>
        <DataTable
          caption="New donor and receiver registrations over the last 12 months"
          columns={MONTHLY_COLUMNS}
          rows={monthlyRegistrations}
          getRowKey={(row) => row.month}
        />
      </section>

      <section aria-labelledby="completed-heading" className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="completed-heading" className="text-lg font-semibold text-ink">
            Completed requests
          </h2>
          <Link
            href="/dashboard/requests?status=FULFILLED"
            className="inline-flex min-h-11 items-center rounded-lg border border-line-strong bg-card px-4 text-sm font-semibold text-ink transition-colors hover:bg-surface"
          >
            See all in Blood requests
          </Link>
        </div>

        {completedRequests.recent.length === 0 ? (
          <EmptyState title="No completed requests yet" message="Fulfilled requests appear here." />
        ) : (
          <>
            <DataTable
              caption="The most recently fulfilled blood requests"
              columns={COMPLETED_COLUMNS}
              rows={completedRequests.recent}
            />
            <p className="mt-2 text-sm text-ink-muted">
              Showing the {pluralize(completedRequests.recent.length, 'most recent request')} of{' '}
              {completedRequests.total} fulfilled in total.
            </p>
          </>
        )}
      </section>
    </>
  );
}

const DISTRICT_COLUMNS = [
  { key: 'district', header: 'District', cell: (row) => row.district || 'Not recorded' },
  { key: 'state', header: 'State', cell: (row) => <span className="text-ink-muted">{row.state}</span> },
  { key: 'donors', header: 'Donors', numeric: true, cell: (row) => row.donors },
];

const GROUP_COLUMNS = [
  { key: 'group', header: 'Blood group', cell: (row) => <BloodGroup group={row.bloodGroup} /> },
  { key: 'donors', header: 'Donors', numeric: true, cell: (row) => row.donors },
];

const MONTHLY_COLUMNS = [
  { key: 'month', header: 'Month', cell: (row) => row.label },
  { key: 'donors', header: 'Donors registered', numeric: true, cell: (row) => row.donors },
  { key: 'receivers', header: 'Receivers registered', numeric: true, cell: (row) => row.receivers },
  { key: 'total', header: 'Total', numeric: true, cell: (row) => row.donors + row.receivers },
];

const COMPLETED_COLUMNS = [
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
  { key: 'requester', header: 'Posted by', cell: (row) => row.requesterName || 'An app user' },
  { key: 'when', header: 'Posted', cell: (row) => formatDateTime(row.createdAt) },
];
