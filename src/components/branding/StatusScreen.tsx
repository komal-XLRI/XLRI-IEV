import type { ReactNode } from 'react';
import { XlriLogo } from './XlriLogo';

/**
 * Full-page frame for 404 / 403 / crash screens.
 *
 * These render outside the application shell, so without this they would be the
 * only screens in the system with no indication of whose system they belong to
 * — which is exactly when a user is most likely to be unsure whether they are
 * still in the right place.
 */
export function StatusScreen({
  code,
  title,
  description,
  action,
}: {
  code: string;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <main className="bg-background flex min-h-dvh flex-col items-center justify-center px-4 py-12 text-center">
      <XlriLogo height={32} plate priority />

      <span aria-hidden="true" className="bg-accent mt-4 h-0.5 w-10 rounded-full" />

      <p className="text-muted-foreground mt-6 text-xs font-semibold tracking-[0.2em] uppercase">
        {code}
      </p>
      <h1 className="mt-1.5 text-lg font-semibold">{title}</h1>
      <div className="text-muted-foreground mt-1.5 max-w-md text-sm">{description}</div>

      {action ? <div className="mt-4">{action}</div> : null}

      <p className="text-muted-foreground mt-10 text-[11px]">
        XLRI Xavier School of Management · IEV Activity Tracker
      </p>
    </main>
  );
}
