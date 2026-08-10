'use client';

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, KpiSkeleton, Skeleton } from '@/components/ui/Card';

/**
 * Shared route-level states.
 *
 * Every dynamic segment gets a `loading.tsx` and an `error.tsx` built from
 * these, so a slow query shows the shape of the page rather than a blank area,
 * and a failed one shows something recoverable rather than nothing at all.
 * The shell — rail, header — stays mounted throughout, because Next renders
 * these inside the layout.
 */

/** Placeholder shaped like a typical record page: heading, metrics, a table. */
export function RouteSkeleton({ metrics = 4, rows = 6 }: { metrics?: number; rows?: number }) {
  return (
    <div role="status" aria-live="polite" className="space-y-5">
      <span className="sr-only">Loading this page</span>

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-3.5 w-96 max-w-full" />
      </div>

      {metrics > 0 ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: metrics }, (_, index) => (
            <KpiSkeleton key={index} />
          ))}
        </div>
      ) : null}

      <Card>
        <div className="flex items-center gap-3 border-b px-5 py-3.5">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-7 w-24" />
        </div>
        <div className="space-y-3 px-5 py-4">
          {Array.from({ length: rows }, (_, index) => (
            <div key={index} className="flex items-center gap-4">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

/**
 * Segment-level error.
 *
 * Shows the digest, not the message: the message can carry query fragments or
 * record identifiers, and the digest is the handle the server log is keyed on.
 */
export function RouteError({
  error,
  reset,
  area,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  area: string;
}) {
  return (
    <Card>
      <div className="flex flex-col items-center gap-2.5 px-6 py-12 text-center">
        <span className="bg-danger-soft text-danger-soft-foreground inline-flex size-11 items-center justify-center rounded-full">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>

        <p className="text-[13.5px] font-semibold">{area} could not be loaded</p>
        <p className="type-secondary max-w-md">
          Something went wrong while fetching this data. Try again — if it keeps happening, send the
          reference below to the programme office.
        </p>

        {error.digest ? <p className="type-caption font-mono">Reference: {error.digest}</p> : null}

        <Button onClick={reset} className="mt-2">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </Card>
  );
}
