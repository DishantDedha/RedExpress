import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';
import { SessionProvider } from '@/components/SessionProvider';
import { requireSession } from '@/lib/session';

/**
 * The admin shell, and the second of the two auth checks.
 *
 * The proxy already redirected anyone without cookies — but a cookie is not a session. This
 * layout asks the backend who the holder actually is, which is what catches a staff account
 * that was blocked or had its tokenVersion bumped since the cookie was issued. The proxy is
 * the fast path; this is the real one.
 *
 * ## The layout
 *
 * A red rail down the left, and a white content column beside it holding a thin user bar and
 * the page. The rail used to be a white column under a full-width header, which meant the
 * brand, the navigation and the page title each got their own horizontal band and the eye had
 * nowhere to start.
 *
 * On a narrow screen the two stack, rail first — no drawer, no toggle, no client state. A
 * hamburger menu is a control that has to be found, labelled, focus-trapped and closed on
 * navigation, and three navigation items do not justify any of that. Stacked, they are simply
 * there.
 *
 * `min-w-0` on the content column is not cosmetic: without it a wide table refuses to shrink
 * below its intrinsic width, and instead of scrolling inside its own wrapper it pushes the
 * whole page sideways.
 */
export default async function DashboardLayout({ children }) {
  const user = await requireSession();

  return (
    <SessionProvider user={user}>
      <div className="flex min-h-screen flex-col md:flex-row">
        {/* First tab stop on every page. A keyboard user should not have to walk the whole
            navigation to reach the table they came for. */}
        <a
          href="#main-content"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-lg bg-brand px-4 py-3 font-semibold text-white"
        >
          Skip to main content
        </a>

        <Sidebar />

        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar user={user} />

          {/* tabIndex={-1} makes this a valid target for the skip link. */}
          <main id="main-content" tabIndex={-1} className="flex-1 p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
