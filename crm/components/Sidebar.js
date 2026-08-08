'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Primary navigation.
 *
 * One list, declared here. The calling worklist is not an entry of its own — it lives under a
 * blood request, because staff always reach it by opening the request they are working.
 *
 * `aria-current="page"` marks the active link. The red background is the sighted version of
 * the same fact; neither is allowed to be the only one.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '▤', description: 'Today at a glance' },
  { href: '/dashboard/users', label: 'People', icon: '☰', description: 'Search donors, receivers and staff' },
  { href: '/dashboard/requests', label: 'Blood requests', icon: '✚', description: 'Open requests and calling worklists' },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <nav aria-label="Main" className="flex h-full flex-col gap-1 p-3">
      <ul className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          // Exact match for the index, prefix match for its children, so /dashboard/users
          // does not light up both entries once Phase 13 lands.
          const isActive = item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? 'page' : undefined}
                className={[
                  'flex min-h-11 items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                  isActive ? 'bg-brand text-white' : 'text-ink hover:bg-brand-tint hover:text-brand-ink',
                ].join(' ')}
              >
                <span aria-hidden="true" className="text-base">
                  {item.icon}
                </span>
                {item.label}
                {/* Sighted staff get the section's purpose from the page they land on; heard
                    on its own, "People" does not say what is in it. */}
                <span className="sr-only-focusable absolute">— {item.description}</span>
              </Link>
            </li>
          );
        })}
      </ul>

      <p className="mt-auto px-3 pb-2 text-xs text-ink-muted">
        Red Express staff dashboard
        <span className="block">Handle donor data with care.</span>
      </p>
    </nav>
  );
}
