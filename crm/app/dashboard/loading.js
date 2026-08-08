import { LoadingState } from '@/components/ui/States';

/** Route-level Suspense fallback. Announced, not just a blank panel. */
export default function DashboardLoading() {
  return <LoadingState label="Loading dashboard…" rows={4} />;
}
