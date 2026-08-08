import { LoadingState } from '@/components/ui/States';

/** Covers both the request list and a request's calling worklist. */
export default function RequestsLoading() {
  return <LoadingState label="Loading blood requests…" rows={6} />;
}
