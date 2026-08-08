'use client';

import { useState } from 'react';
import Card from '@/components/ui/Card';
import StatusBadge from '@/components/ui/StatusBadge';
import Badge, { AvailabilityBadge } from '@/components/ui/Badge';
import CallHistory from '@/components/CallHistory';
import DonorActions from '@/components/worklist/DonorActions';
import LifecycleLegend from '@/components/worklist/LifecycleLegend';
import { pluralize } from '@/lib/format';

/**
 * The live part of a person's page: their current status, the call controls, and the history
 * those controls write to.
 *
 * Status, actions and history are one component because they are one fact. Marking someone
 * unreachable changes the badge, changes which action is offered, and adds a line to the
 * history — if those lived in three server-rendered cards, two of them would still be showing
 * the old story until the next navigation.
 *
 * Calls made from here carry no `requestId`. That is correct and deliberate: a call from a
 * person's own page is housekeeping ("are you still willing to donate?"), not work on a
 * request, and attributing it to one would corrupt the "three attempts for this request" count
 * that the worklist relies on.
 */
export default function DonorRecordPanel({ user, initialCalls, canBeMarked }) {
  const [status, setStatus] = useState(user.status);
  const [calls, setCalls] = useState(initialCalls ?? []);

  function handleChanged(change) {
    if (change.status) setStatus(change.status);
    if (change.history) setCalls(change.history);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <StatusBadge status={status} showHint />
        {user.role === 'DONOR' ? (
          <AvailabilityBadge isAvailable={status === 'DEAD' ? false : user.isAvailable} />
        ) : null}
        {user.isPhoneVerified ? (
          <Badge tone="success">Phone verified</Badge>
        ) : (
          <Badge tone="warning">Phone not verified</Badge>
        )}
      </div>

      {status === 'DEAD' ? (
        // Stated in full, every time. The consequence of this status is the reason it exists,
        // and a red badge communicates none of it.
        <p className="rounded-md border border-warning bg-warning-tint p-3 text-sm text-ink">
          <span aria-hidden="true">▲ </span>
          Marked unreachable. They are hidden from donor search, receive no alerts, and were signed out
          on every device. They return to active by themselves the next time they sign in on the app with
          a one-time password — though they stay marked not available until they switch that back on.
        </p>
      ) : null}

      {canBeMarked ? (
        <Card title="Call this person" description="Ring them, then record what happened.">
          <DonorActions
            donorUserId={user.id}
            donorName={user.name}
            phone={user.phone}
            status={status}
            onChanged={handleChanged}
          />
        </Card>
      ) : (
        <Card title="Call log">
          <p className="text-sm text-ink-muted">
            This is a staff account. Call outcomes and the unreachable status apply to donors and
            receivers only — ask an administrator to disable a staff account instead.
          </p>
        </Card>
      )}

      <Card title="Call history" description={`${pluralize(calls.length, 'call')} logged by staff.`}>
        <CallHistory calls={calls} />
      </Card>

      <LifecycleLegend />
    </div>
  );
}
