import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import DetailList from '@/components/ui/DetailList';
import DataTable from '@/components/ui/DataTable';
import BloodGroup from '@/components/ui/BloodGroup';
import PhoneLink from '@/components/ui/PhoneLink';
import LocationPanel from '@/components/ui/LocationPanel';
import Badge, { RequestStatusBadge, UrgencyBadge } from '@/components/ui/Badge';
import DonorRecordPanel from '@/components/worklist/DonorRecordPanel';
import { apiGet } from '@/lib/session';
import { BackendError } from '@/lib/api';
import { AUDIT_ACTION_LABELS, MATCH_RESPONSES, bloodGroupLabel } from '@/lib/constants';
import { formatDate, formatDateTime, formatDistance, formatRelative } from '@/lib/format';
import { roleLabel } from '@/lib/roles';

/**
 * Everything Red Express knows about one person.
 *
 * This is the page a staff member reads before deciding whether a donor has really gone
 * unreachable, so it deliberately shows the evidence rather than a summary: every call, every
 * request they were asked about and what they answered, and the audit trail of who changed
 * their status and why. Phase 14 adds the actions — the call-outcome buttons and mark-dead —
 * on top of exactly this layout.
 */
export async function generateMetadata({ params }) {
  const { userId } = await params;
  const data = await loadUser(userId).catch(() => null);
  return { title: data?.user?.name || 'Person' };
}

export default async function UserDetailPage({ params }) {
  const { userId } = await params;
  const data = await loadUser(userId);

  const { user, donorProfile, location, calls, audit, requestsPosted, matches, counts } = data;
  const isDonor = user.role === 'DONOR';

  return (
    <>
      <PageHeader
        title={user.name || 'Name not given'}
        description={`${roleLabel(user.role)} · joined ${formatDate(user.createdAt)}`}
        actions={
          <>
            <PhoneLink phone={user.phone} name={user.name || 'this person'} />
            <Link
              href="/dashboard/users"
              className="inline-flex min-h-11 items-center rounded-md border border-line-strong bg-card px-4 text-sm font-semibold text-ink hover:bg-surface"
            >
              Back to people
            </Link>
          </>
        }
      />

      {/* Status, the call controls and the history are one client component: marking someone
          unreachable changes all three at once, and two of them going stale until the next
          navigation is exactly how a donor gets rung twice. */}
      <div className="mb-6">
        <DonorRecordPanel
          user={user}
          initialCalls={calls}
          canBeMarked={user.role === 'DONOR' || user.role === 'RECEIVER'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Profile">
            <DetailList
              label="Profile details"
              items={[
                { label: 'Full name', value: user.name },
                { label: 'Role', value: roleLabel(user.role) },
                {
                  label: 'Phone',
                  value: <PhoneLink phone={user.phone} name={user.name || 'this person'} />,
                },
                { label: 'Email', value: user.email },
                isDonor && {
                  label: 'Blood group',
                  value: (
                    <span className="flex items-center gap-2">
                      <BloodGroup group={user.bloodGroup} />
                      <span>{bloodGroupLabel(user.bloodGroup)}</span>
                    </span>
                  ),
                },
                donorProfile && { label: 'Gender', value: donorProfile.gender },
                isDonor && {
                  label: 'Last donation',
                  value: user.lastDonationDate
                    ? `${formatDate(user.lastDonationDate)} (${formatRelative(user.lastDonationDate)})`
                    : 'Never recorded',
                },
                { label: 'Registered', value: formatDateTime(user.createdAt) },
              ]}
            />
          </Card>

          {isDonor ? (
            <Card
              title="Requests this donor was asked about"
              description="What the matching engine sent them, and how they answered in the app."
            >
              {matches.length === 0 ? (
                <p className="text-sm text-ink-muted">
                  This donor has not been matched to any blood request yet.
                </p>
              ) : (
                <DataTable caption="Blood requests this donor was notified about" columns={MATCH_COLUMNS} rows={matches} />
              )}
            </Card>
          ) : null}

          {requestsPosted.length > 0 ? (
            <Card title="Blood requests they posted">
              <DataTable
                caption="Blood requests posted by this person"
                columns={POSTED_COLUMNS}
                rows={requestsPosted}
              />
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <Card title="Location">
            <LocationPanel
              latitude={location?.latitude}
              longitude={location?.longitude}
              city={user.city}
              district={user.district}
              state={user.state}
              address={donorProfile?.address}
              pincode={donorProfile?.pincode}
            />
          </Card>

          <Card title="Activity" description="Totals for this account.">
            <DetailList
              label="Activity totals"
              columns="grid-cols-2"
              items={[
                { label: 'Calls logged', value: counts.calls },
                { label: 'Times notified', value: counts.matches },
                { label: 'Accepted', value: counts.accepted },
                { label: 'Requests posted', value: counts.requestsPosted },
              ]}
            />
          </Card>

          <Card
            title="Status history"
            description="Who changed this account's status, and why."
          >
            {audit.length === 0 ? (
              <p className="text-sm text-ink-muted">
                This account&rsquo;s status has never been changed by staff.
              </p>
            ) : (
              <ol className="space-y-3">
                {audit.map((entry) => (
                  <li key={entry.id} className="rounded-md border border-line bg-surface p-3 text-sm">
                    <p className="font-semibold text-ink">
                      {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                    </p>
                    <p className="mt-0.5 text-ink-muted">
                      {formatDateTime(entry.createdAt)} · {entry.actorName ?? 'a staff member'}
                    </p>
                    {entry.note ? <p className="mt-1.5 text-ink">{entry.note}</p> : null}
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * A person who no longer exists is a 404, not an error page.
 *
 * Staff reach these URLs from bookmarks and from links pasted into chat, so "this record is
 * gone" is a normal outcome and should read like one.
 */
async function loadUser(userId) {
  try {
    return await apiGet(`/crm/users/${encodeURIComponent(userId)}`);
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) notFound();
    throw error;
  }
}

const MATCH_COLUMNS = [
  {
    key: 'hospital',
    header: 'Request',
    cell: (row) => (
      <Link href={`/dashboard/requests/${row.requestId}`} className="text-brand underline underline-offset-4">
        {row.request.hospitalName || 'Unnamed hospital'}
      </Link>
    ),
  },
  { key: 'group', header: 'Blood group', cell: (row) => <BloodGroup group={row.request.bloodGroup} /> },
  {
    key: 'distance',
    header: 'Distance',
    cell: (row) => <span className="text-ink-muted">{formatDistance(row.distanceKm)}</span>,
  },
  {
    key: 'response',
    header: 'Their answer',
    cell: (row) => {
      const config = MATCH_RESPONSES[row.response] ?? MATCH_RESPONSES.PENDING;
      return <Badge tone={config.tone}>{config.label}</Badge>;
    },
  },
  {
    key: 'notified',
    header: 'Notified',
    cell: (row) => <span className="text-ink-muted">{formatDateTime(row.notifiedAt ?? row.createdAt)}</span>,
  },
];

const POSTED_COLUMNS = [
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
  { key: 'urgency', header: 'Urgency', cell: (row) => <UrgencyBadge urgency={row.urgency} /> },
  { key: 'status', header: 'Status', cell: (row) => <RequestStatusBadge status={row.status} /> },
  {
    key: 'posted',
    header: 'Posted',
    cell: (row) => <span className="text-ink-muted">{formatDateTime(row.createdAt)}</span>,
  },
];
