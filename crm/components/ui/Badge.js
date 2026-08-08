/**
 * The general-purpose pill: urgency, call outcome, match response, availability.
 *
 * `StatusBadge` stays separate because ACTIVE / DEAD / BLOCKED carry an explanatory hint and
 * are the one label in the CRM with a jargon meaning. Everything else that needs a pill uses
 * this.
 *
 * A tone is *never* the only carrier of meaning — the badge always renders its word, and each
 * tone has a distinct glyph so the set stays separable in greyscale (WCAG 1.4.1).
 */

const TONES = {
  neutral: { className: 'border-line-strong bg-surface text-ink-muted', icon: '○' },
  success: { className: 'border-success bg-success-tint text-success', icon: '●' },
  warning: { className: 'border-warning bg-warning-tint text-warning', icon: '▲' },
  danger: { className: 'border-danger bg-danger-tint text-danger', icon: '■' },
  info: { className: 'border-info bg-info-tint text-info', icon: '◆' },
  brand: { className: 'border-brand bg-brand-tint text-brand-ink', icon: '✚' },
};

export default function Badge({ tone = 'neutral', children, icon, title, className = '' }) {
  const config = TONES[tone] ?? TONES.neutral;

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${config.className} ${className}`}
    >
      <span aria-hidden="true">{icon ?? config.icon}</span>
      {children}
    </span>
  );
}

/**
 * Urgency, from the blood request.
 *
 * Written "Critical", not "CRITICAL": a screen reader spells all-caps words out letter by
 * letter, which is the same reason the push copy in Phase 5 avoids them.
 */
export function UrgencyBadge({ urgency }) {
  const map = {
    CRITICAL: { tone: 'danger', label: 'Critical' },
    URGENT: { tone: 'warning', label: 'Urgent' },
    NORMAL: { tone: 'neutral', label: 'Normal' },
  };
  const config = map[urgency] ?? { tone: 'neutral', label: urgency ?? 'Unknown' };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

/** Request status. EXPIRED is the computed one — see requestView in requestService.js. */
export function RequestStatusBadge({ status }) {
  const map = {
    OPEN: { tone: 'success', label: 'Open' },
    FULFILLED: { tone: 'info', label: 'Fulfilled' },
    CANCELLED: { tone: 'neutral', label: 'Cancelled' },
    EXPIRED: { tone: 'warning', label: 'Expired' },
  };
  const config = map[status] ?? { tone: 'neutral', label: status ?? 'Unknown' };
  return <Badge tone={config.tone}>{config.label}</Badge>;
}

/** Whether the donor has their "available to donate" switch on. */
export function AvailabilityBadge({ isAvailable }) {
  if (isAvailable === null || isAvailable === undefined) {
    return <Badge tone="neutral">No donor profile</Badge>;
  }
  return isAvailable ? (
    <Badge tone="success">Available</Badge>
  ) : (
    <Badge tone="warning">Not available</Badge>
  );
}
