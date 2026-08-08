/**
 * The ACTIVE / DEAD / BLOCKED badge.
 *
 * Always renders the status **word**. The colour is a second, redundant signal — a staff
 * member with a colour vision deficiency and a staff member using a screen reader both get
 * the same information as everyone else, which is the point of WCAG 1.4.1.
 *
 * "Dead" is Red Express jargon for "we phoned and could not reach them", not a statement
 * about a person, so the badge carries a title explaining it. Phase 14 puts the full
 * lifecycle legend on the worklist itself.
 */

const STATUS = {
  ACTIVE: {
    label: 'Active',
    hint: 'Appears in donor search and receives notifications.',
    className: 'border-success bg-success-tint text-success',
    icon: '●',
  },
  DEAD: {
    label: 'Dead',
    hint: 'Unreachable by phone. Hidden from search until they sign in again.',
    className: 'border-danger bg-danger-tint text-danger',
    icon: '■',
  },
  BLOCKED: {
    label: 'Blocked',
    hint: 'Administratively blocked. Cannot sign in at all.',
    className: 'border-warning bg-warning-tint text-warning',
    icon: '▲',
  },
};

export default function StatusBadge({ status, showHint = false }) {
  const config = STATUS[status] ?? {
    label: status ?? 'Unknown',
    hint: '',
    className: 'border-line-strong bg-surface text-ink-muted',
    icon: '○',
  };

  return (
    <span
      title={showHint ? config.hint : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${config.className}`}
    >
      {/* Shape differs per status too, so the badges stay distinguishable in greyscale. */}
      <span aria-hidden="true">{config.icon}</span>
      {config.label}
    </span>
  );
}
