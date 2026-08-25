import Link from 'next/link';
import ForgotPasswordForm from './ForgotPasswordForm';
import { BrandMark } from '@/components/ui/Icon';

export const metadata = { title: 'Forgot password' };

/**
 * Staff password reset — request stage.
 *
 * Same red-panel/white-card split as /login (see that page for the reasoning): a staff
 * member who has just been bounced here from a failed sign-in should recognise the screen
 * before reading it.
 */
export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-10">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-panel border border-line bg-card shadow-raised lg:grid-cols-2">
        <div className="brand-band hidden flex-col justify-between p-8 lg:flex">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9 text-white" />
            <span className="text-lg font-bold tracking-tight text-white">Red Express</span>
          </div>
          <div>
            <p className="text-2xl font-bold leading-snug text-white">Reset your dashboard password.</p>
            <p className="mt-3 text-sm text-on-brand-muted">
              We will email a reset link to the address on your staff account, if it has one.
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

          <ForgotPasswordForm />

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
