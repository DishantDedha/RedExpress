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
 */
export default async function DashboardLayout({ children }) {
  const user = await requireSession();

  return (
    <SessionProvider user={user}>
      <div className="flex min-h-screen flex-col">
        {/* First tab stop on every page. A keyboard user should not have to walk the whole
            navigation to reach the table they came for. */}
        <a
          href="#main-content"
          className="sr-only-focusable absolute left-4 top-4 z-50 rounded-md bg-brand px-4 py-3 font-semibold text-white"
        >
          Skip to main content
        </a>

        <Topbar user={user} />

        <div className="flex flex-1 flex-col md:flex-row">
          <div className="border-b border-line bg-card md:w-60 md:shrink-0 md:border-b-0 md:border-r">
            <Sidebar />
          </div>

          {/* tabIndex={-1} makes this a valid target for the skip link. */}
          <main id="main-content" tabIndex={-1} className="flex-1 p-4 md:p-6">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
