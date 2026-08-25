import Link from 'next/link';
import ResetPasswordForm from './ResetPasswordForm';
import { BrandMark } from '@/components/ui/Icon';

export const metadata = { title: 'Reset password' };

export default async function ResetPasswordPage({ searchParams }) {
  const params = await searchParams;
  const token = typeof params?.token === 'string' ? params.token : '';

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-panel border border-line bg-card shadow-raised lg:grid-cols-2">
        <div className="brand-band hidden flex-col justify-between p-8 lg:flex">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9 text-white" />
            <span className="text-lg font-bold tracking-tight text-white">Red Express</span>
          </div>
          <div>
            <p className="text-2xl font-bold leading-snug text-white">Set a new password.</p>
            <p className="mt-3 text-sm text-on-brand-muted">
              This ends every other session on your account, so sign in again anywhere else you use
              the dashboard.
            </p>
          </div>
        </div>

        <div className="p-6 md:p-8">
          <div className="mb-6 lg:hidden">
            <p className="flex items-center gap-2 text-2xl font-bold text-brand">
              <BrandMark className="h-7 w-7 text-brand" cross="var(--color-card)" />
              Red Express
            </p>
            <p className="mt-1 text-sm text-ink-muted">Staff dashboard</p>
          </div>

          {token ? (
            <ResetPasswordForm token={token} />
          ) : (
            <div className="flex flex-col gap-4">
              <h1 className="text-xl font-bold text-ink">This link is incomplete</h1>
              <p className="text-sm text-ink-muted">
                Open the reset link from your email again, or request a new one.
              </p>
              <Link
                href="/forgot-password"
                className="text-sm font-semibold text-brand underline underline-offset-4 hover:text-brand-pressed"
              >
                Request a new reset link
              </Link>
            </div>
          )}

          <p className="mt-6 text-sm text-ink-muted">
            <Link href="/login" className="text-brand underline underline-offset-4 hover:text-brand-pressed">
              Back to sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
