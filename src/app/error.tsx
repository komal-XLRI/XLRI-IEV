'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/Button';
import { StatusScreen } from '@/components/branding/StatusScreen';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The message itself stays on the server; only the digest is safe to show.
    console.error('Rendering error', error.digest ?? error.message);
  }, [error]);

  return (
    <StatusScreen
      code="Error"
      title="Something went wrong"
      description={
        <>
          <p>
            The page could not be loaded. Try again, and contact the programme office if it keeps
            happening.
          </p>
          {error.digest ? (
            <p className="text-muted-foreground mt-2 font-mono text-xs">
              Reference: {error.digest}
            </p>
          ) : null}
        </>
      }
      action={<Button onClick={reset}>Try again</Button>}
    />
  );
}
