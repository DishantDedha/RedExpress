'use client';

import { useState } from 'react';
import Link from 'next/link';
import DataTable from '@/components/ui/DataTable';
import StatusBadge from '@/components/ui/StatusBadge';
import BloodGroup from '@/components/ui/BloodGroup';
import Badge, { AvailabilityBadge } from '@/components/ui/Badge';
import DonorActions from '@/components/worklist/DonorActions';
import CallHistoryDisclosure from '@/components/worklist/CallHistoryDisclosure';
import { MATCH_RESPONSES } from '@/lib/constants';
import { formatArea, formatDateTime, formatDistance } from '@/lib/format';

/**
 * The calling worklist: who to ring for this request, nearest first, with the controls to
 * record what happened.
 *
 * A client component because the rows have to change under the staff member's hands. When a
 * donor is marked unreachable the badge in that row turns to Dead immediately and the actions
 * become "Reactivate" (or an explanation, for STAFF) — waiting for a server round trip to
 * redraw a forty-row table would leave someone staring at a stale Active badge wondering
 * whether the button worked.
 *
 * `overrides` is that live layer. It is keyed by donor id and holds only what an action
 * changed; everything else still comes from the server render. The server action revalidates
 * as well, so the next navigation replaces this layer with the authoritative data rather than
 * letting the two drift.
 *
 * Sort order is deliberately *not* recomputed when a row changes. A donor marked dead stays
 * where they are, dimmed, instead of vanishing or jumping to the bottom — a list that
 * reshuffles under someone working down it is how names get skipped.
 */
export default function WorklistTable({ requestId, donors, caption, isPreview = false }) {
  const [overrides, setOverrides] = useState({});

  function handleChanged(donorUserId, change) {
    setOverrides((current) => ({
      ...current,
      [donorUserId]: { ...current[donorUserId], ...change },
    }));
  }

  const rows = donors.map((row) => {
    const override = overrides[row.donorUserId] ?? {};
    return {
      ...row,
      status: override.status ?? row.donor?.status ?? null,
      lastCall: override.lastCall ?? row.lastCall,
      // A recorded call is one more attempt; the count has to move with it or "2 attempts"
      // sits there contradicting the entry the staff member just made.
      callCount: override.history ? override.history.length : row.callCount,
      history: override.history ?? null,
    };
  });

  const columns = [
    {
      key: 'donor',
      header: 'Donor',
      cell: (row) => (
        <>
          <Link
            href={`/dashboard/users/${row.donorUserId}`}
            className="text-brand underline underline-offset-4 hover:text-brand-pressed"
          >
            {row.donor?.name || 'Name not given'}
          </Link>
          <span className="mt-0.5 block text-xs font-normal text-ink-muted">
            {formatArea(row.donor?.city, row.donor?.district)}
          </span>
        </>
      ),
    },
    {
      key: 'distance',
      header: 'Distance',
      cell: (row) => <span className="font-medium text-ink">{formatDistance(row.distanceKm)}</span>,
    },
    { key: 'group', header: 'Blood group', cell: (row) => <BloodGroup group={row.donor?.bloodGroup} /> },
    {
      key: 'status',
      header: 'Status',
      cell: (row) => (
        <div className="space-y-1">
          <StatusBadge status={row.status} showHint />
          <AvailabilityBadge isAvailable={row.status === 'DEAD' ? false : row.donor?.isAvailable} />
        </div>
      ),
    },
    {
      key: 'response',
      header: 'Answered in app',
      cell: (row) => {
        if (row.response === null || row.response === undefined) {
          return <span className="text-ink-muted">Not notified</span>;
        }
        const config = MATCH_RESPONSES[row.response] ?? MATCH_RESPONSES.PENDING;
        return (
          <div className="space-y-1">
            <Badge tone={config.tone}>{config.label}</Badge>
            {row.respondedAt ? (
              <span className="block text-xs text-ink-muted">{formatDateTime(row.respondedAt)}</span>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'calls',
      header: 'Call history',
      cell: (row) => (
        <CallHistoryDisclosure
          donorUserId={row.donorUserId}
          lastCall={row.lastCall}
          callCount={row.callCount}
          history={row.history}
        />
      ),
    },
    {
      key: 'actions',
      header: 'Call and record the outcome',
      cell: (row) => (
        <DonorActions
          donorUserId={row.donorUserId}
          donorName={row.donor?.name}
          phone={row.donor?.phone}
          status={row.status}
          requestId={requestId}
          onChanged={(change) => handleChanged(row.donorUserId, change)}
        />
      ),
      className: 'min-w-64',
    },
  ];

  return (
    <DataTable
      caption={caption ?? `Donors to call, nearest first${isPreview ? '. Preview list — these donors were not notified' : ''}`}
      columns={columns}
      rows={rows}
      getRowKey={(row) => row.donorUserId}
      // Dimmed, not hidden: staff need to see that a name was tried and taken out of
      // circulation, and the row is where the reactivate control lives.
      rowClassName={(row) => (row.status === 'DEAD' ? 'bg-surface' : '')}
    />
  );
}
