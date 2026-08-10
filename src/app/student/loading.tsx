import { RouteSkeleton } from '@/components/layout/RouteStates';

export default function Loading() {
  return <RouteSkeleton metrics={4} rows={6} />;
}
