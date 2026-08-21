import { bloodGroupLabel, bloodGroupShort } from '@/lib/constants';

/**
 * A blood group, shown short and read long.
 *
 * "O-" is what staff scan for on a crowded row; "O negative" is what has to be spoken. A
 * screen reader reads "O-" as "O" and drops the minus, or reads it as "O dash" — either way
 * the difference between O positive and O negative disappears, and that difference is the
 * whole product. So the visible text is hidden from the accessibility tree and the full label
 * is supplied beside it.
 */
export default function BloodGroup({ group, className = '' }) {
  if (!group) return <span className={`text-ink-muted ${className}`}>No blood group</span>;

  return (
    <span
      className={`inline-flex min-w-11 items-center justify-center rounded-lg border border-brand bg-brand-tint px-2 py-1 text-sm font-bold text-brand-ink ${className}`}
    >
      <span aria-hidden="true">{bloodGroupShort(group)}</span>
      <span className="sr-only-focusable absolute">{bloodGroupLabel(group)}</span>
    </span>
  );
}
