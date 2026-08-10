import { RouteSkeleton } from '@/components/layout/RouteStates';

export default function Loading() {
  return <RouteSkeleton metrics={5} rows={6} />;
}
