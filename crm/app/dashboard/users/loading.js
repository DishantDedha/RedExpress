import { LoadingState } from '@/components/ui/States';

/** Covers both the people list and a person's detail page. */
export default function UsersLoading() {
  return <LoadingState label="Loading people…" rows={6} />;
}
