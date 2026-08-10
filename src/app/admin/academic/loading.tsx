import { RouteSkeleton } from '@/components/layout/RouteStates';

export default function Loading() {
  return <RouteSkeleton metrics={0} rows={6} />;
}
