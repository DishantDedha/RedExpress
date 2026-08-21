import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-xl p-6">
      <h1 className="text-2xl font-bold text-ink">Page not found</h1>
      <p className="mt-2 text-sm text-ink-muted">
        That address does not match anything in the staff dashboard.
      </p>
      <Link
        href="/dashboard"
        className="mt-4 inline-flex min-h-11 items-center rounded-lg bg-brand px-4 font-semibold text-white hover:bg-brand-pressed"
      >
        Go to the dashboard
      </Link>
    </main>
  );
}
