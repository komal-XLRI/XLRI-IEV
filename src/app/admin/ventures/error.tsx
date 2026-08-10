'use client';

import { RouteError } from '@/components/layout/RouteStates';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <RouteError error={error} reset={reset} area="The venture list" />;
}
