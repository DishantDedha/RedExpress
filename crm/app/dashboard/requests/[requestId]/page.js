import Link from 'next/link';
import { notFound } from 'next/navigation';
import PageHeader from '@/components/ui/PageHeader';
import Card from '@/components/ui/Card';
import DetailList from '@/components/ui/DetailList';
import LocationPanel from '@/components/ui/LocationPanel';
import BloodGroup from '@/components/ui/BloodGroup';
import PhoneLink from '@/components/ui/PhoneLink';
import { RequestStatusBadge, UrgencyBadge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/States';
import WorklistTable from '@/components/worklist/WorklistTable';
import LifecycleLegend from '@/components/worklist/LifecycleLegend';
import { apiGet } from '@/lib/session';
import { BackendError } from '@/lib/api';
import { bloodGroupLabel } from '@/lib/constants';
import { formatDateTime, formatRelative, pluralize } from '@/lib/format';

/**
 * One blood request, and the calling worklist under it.
 *
 * The worklist comes from /crm/donors/nearby, which returns the RequestMatch rows the engine
 * wrote when the request was posted — the same people who got the push, in the same order,
 * with the distance frozen at match time so the list does not reshuffle under a staff member
 * halfway down it.
 *
 * When a request has no matches the backend re-runs the engine in preview mode and says so
 * with `source: 'preview'`. That distinction is surfaced on the page rather than smoothed
 * over: "these people were notified" and "these people are nearby but were never contacted"
 * lead to completely different phone calls.
 *
 * The outcome buttons and the mark-unreachable action land on these rows in Phase 14.
 */
export async function generateMetadata({ params }) {
  const { requestId } = await params;
  const data = await loadWorklist(requestId).catch(() => null);
  return { title: data?.request?.hospitalName ? `Request · ${data.request.hospitalName}` : 'Blood request' };
}

export default async function RequestDetailPage({ params }) {
  const { requestId } = await params;
  const data = await loadWorklist(requestId);

  const { request, donors, source, counts, matching } = data;
  const isPreview = source === 'preview';

  return (
    <>
      <PageHeader
        title={request.hospitalName || 'Unnamed hospital'}
        description={`${bloodGroupLabel(request.bloodGroup)} · ${pluralize(request.unitsNeeded, 'unit')} · posted ${formatRelative(request.createdAt)}`}
        actions={
          <Link
            href="/dashboard/requests"
            className="inline-flex min-h-11 items-center rounded-md border border-line-strong bg-card px-4 text-sm font-semibold text-ink hover:bg-surface"
          >
            Back to requests
          </Link>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <BloodGroup group={request.bloodGroup} />
        <UrgencyBadge urgency={request.urgency} />
        <RequestStatusBadge status={request.status} />
        {request.isExpired ? (
          <p className="text-sm text-ink">
            This request has passed its expiry time. No further donors are being notified.
          </p>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Request details" className="lg:col-span-2">
          <DetailList
            label="Blood request details"
            items={[
              { label: 'Hospital', value: request.hospitalName },
              {
                label: 'Contact number',
                value: <PhoneLink phone={request.contactPhone} name="the requester" />,
              },
              { label: 'Blood group needed', value: bloodGroupLabel(request.bloodGroup) },
              { label: 'Units needed', value: request.unitsNeeded },
              { label: 'Posted by', value: request.requesterName || 'An app user' },
              {
                label: 'Posted at',
                value: `${formatDateTime(request.createdAt)} (${formatRelative(request.createdAt)})`,
              },
              {
                label: 'Expires',
                value: `${formatDateTime(request.expiresAt)} (${formatRelative(request.expiresAt)})`,
              },
              {
                label: 'Groups that can donate',
                value: request.compatibleDonorGroups?.map(bloodGroupLabel).join(', '),
              },
              { label: 'Note from the requester', value: request.note, span: true },
            ]}
          />
        </Card>

        <div className="space-y-6">
          <Card title="Where">
            <LocationPanel
              latitude={request.latitude}
              longitude={request.longitude}
              city={request.city}
              district={request.district}
              state={request.state}
            />
          </Card>

          <Card title="Donor responses" description="What matched donors answered in the app.">
            <DetailList
              label="Donor response counts"
              columns="grid-cols-3"
              items={[
                { label: 'Accepted', value: counts.ACCEPTED ?? 0 },
                { label: 'Declined', value: counts.DECLINED ?? 0 },
                { label: 'No answer', value: counts.PENDING ?? 0 },
              ]}
            />
            <p className="mt-3 text-sm text-ink-muted">
              A donor answering in the app is separate from what they say on the phone. Both are kept, and
              the call history below is the record of the calls.
            </p>
          </Card>
        </div>
      </div>

      <section aria-labelledby="worklist-heading" className="mt-8">
        <h2 id="worklist-heading" className="text-lg font-semibold text-ink">
          Calling worklist
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {pluralize(donors.length, 'donor')}, nearest first.{' '}
          {isPreview
            ? 'Nobody was notified for this request, so these are the nearest matching donors as of now.'
            : 'These are the donors who were notified when this request was posted.'}
        </p>

        {isPreview && matching ? (
          // Honesty about where the list came from. A staff member ringing someone who never
          // got a push needs to open the call differently.
          <p className="mt-3 rounded-md border border-info bg-info-tint p-3 text-sm text-ink">
            <span aria-hidden="true">ℹ </span>
            Preview list. Matched by {matching.strategy === 'area' ? 'district and city' : `distance, within ${matching.radiusKm} km`}
            {matching.fellBackToArea ? ', after no one was found within the search radius' : ''}.
            {matching.reachedMinimum ? '' : ' Fewer donors were found than the engine looks for.'} These donors have
            not been sent a notification.
          </p>
        ) : null}

        <div className="mt-4">
          <LifecycleLegend />
        </div>

        <div className="mt-4">
          {donors.length === 0 ? (
            <EmptyState
              title="No donors to call"
              message="No matching donors were found near this request. Try the people search to widen the area by hand."
            >
              <Link
                href={`/dashboard/users?role=DONOR&bloodGroup=${request.bloodGroup}&district=${encodeURIComponent(request.district ?? '')}`}
                className="inline-flex min-h-11 items-center rounded-md bg-brand px-5 text-sm font-semibold text-white hover:bg-brand-pressed"
              >
                Search donors by hand
              </Link>
            </EmptyState>
          ) : (
            <WorklistTable
              requestId={request.id}
              donors={donors}
              isPreview={isPreview}
              caption={`Donors to call for this blood request, nearest first${isPreview ? '. Preview list — these donors were not notified' : ''}`}
            />
          )}
        </div>

        <p className="mt-3 text-sm text-ink-muted">
          Record an outcome straight after each call. The history is what tells the next staff member how
          many times this number has already been tried.
        </p>
      </section>
    </>
  );
}

async function loadWorklist(requestId) {
  try {
    return await apiGet('/crm/donors/nearby', { requestId });
  } catch (error) {
    if (error instanceof BackendError && error.status === 404) notFound();
    throw error;
  }
}
