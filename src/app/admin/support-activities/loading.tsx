import { RouteSkeleton } from '@/components/layout/RouteStates';

export default function Loading() {
  return <RouteSkeleton metrics={3} rows={4} />;
}
