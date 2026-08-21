'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Icon, { BrandMark } from '@/components/ui/Icon';

/**
 * Primary navigation, and the app's identity.
 *
 * ## What changed
 *
 * The brand used to sit in the top bar and the navigation in a white column beneath it, so
 * the dashboard opened with two horizontal rules and no visual anchor. The rail now carries
 * both: it is the one deeply saturated surface in the CRM, and everything else — every
 * table, every form, every number a staff member actually reads — sits on white beside it.
 * That is the whole white-and-red idea in one layout decision, and it is also why the red
 * can be this strong without the dashboard becoming tiring to work in for eight hours.
 *
 * ## Contrast on a dark surface
 *
 * The rail is `brand-deep`, where white is 12.84:1 and the muted rail copy is 11.08:1 — AAA
 * rather than AA, because navigation is read at a glance and constantly. The active item
 * inverts to a white pill with `brand-ink` text at 10.04:1 rather than being tinted, so the
 * current section is legible as a *shape* and not only as a colour.
 *
 * The focus ring needs the same care and gets it from `.on-rail` in globals.css: the app's
 * red ring on a red rail is 1.4:1, which is not an indicator at all.
 *
 * ## The active item is not signalled by colour
 *
 * `aria-current="page"` marks it. The white pill is the sighted version of the same fact;
 * neither is allowed to be the only one.
 *
 * One list, declared here. The calling worklist is not an entry of its own — it lives under a
 * blood request, because staff always reach it by opening the request they are working.
 */
const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'grid', description: 'Today at a glance' },
  {
    href: '/dashboard/users',
    label: 'People',
    icon: 'people',
    description: 'Search donors, receivers and staff',
  },
  {
    href: '/dashboard/requests',
    label: 'Blood requests',
    icon: 'drop',
    description: 'Open requests and calling worklists',
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="on-rail brand-rail flex flex-col md:min-h-screen md:w-64 md:shrink-0">
      <div className="flex items-center gap-3 px-5 py-5">
        <BrandMark className="h-9 w-9 text-white" />
        <span className="text-lg font-bold tracking-tight text-white">Red Express</span>
      </div>

      <nav aria-label="Main" className="flex flex-1 flex-col px-3 pb-3">
        <ul className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            // Exact match for the index, prefix match for its children, so /dashboard/users
            // does not light up both entries.
            const isActive =
              item.href === '/dashboard' ? pathname === item.href : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive ? 'page' : undefined}
                  className={[
                    'flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-semibold transition-colors',
                    isActive
                      ? 'bg-card text-brand-ink shadow-card'
                      : 'text-on-brand-muted hover:bg-white/10 hover:text-white',
                  ].join(' ')}
                >
                  <Icon name={item.icon} />
                  {item.label}
                  {/* Sighted staff get the section's purpose from the page they land on; heard
                      on its own, "People" does not say what is in it. */}
                  <span className="sr-only-focusable absolute">— {item.description}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <p className="mt-auto hidden px-3 pt-8 text-xs text-on-brand-muted md:block">
          Red Express staff dashboard
          <span className="block">Handle donor data with care.</span>
        </p>
      </nav>
    </div>
  );
}
