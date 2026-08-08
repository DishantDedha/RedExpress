import { redirect } from 'next/navigation';

/**
 * The CRM has no marketing front page. `/` sends you to the dashboard, and the proxy turns
 * that into `/login` if you have no session.
 */
export default function RootPage() {
  redirect('/dashboard');
}
