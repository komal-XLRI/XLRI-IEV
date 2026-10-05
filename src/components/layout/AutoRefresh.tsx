'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Re-renders the current server page on an interval while the tab is visible.
 *
 * Mentor feedback arrives from Google outside any user's request, so a page
 * that is already open cannot learn about it from a revalidation. Polling a
 * server re-render is the lightest way to keep counts current without adding
 * a real-time channel the application does not otherwise have.
 */
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
