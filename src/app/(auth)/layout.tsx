import type { ReactNode } from 'react';
import { XlriLogo } from '@/components/branding/XlriLogo';
import { ThemeToggle } from '@/components/theme/ThemeToggle';

/**
 * Sign-in chrome.
 *
 * This is the first screen anyone sees, so it is where the institution is
 * named in full. Everything past it is the application's own chrome, which
 * carries the mark once in the rail.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background relative flex min-h-dvh flex-col">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <main className="flex flex-1 flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-7 flex flex-col items-center text-center">
            {/* The mark sits on a white plate so the navy shield keeps its
                contrast on the dark canvas without the artwork being altered.
                On the light canvas the plate is invisible. */}
            <XlriLogo height={38} plate priority />

            <p className="text-muted-foreground mt-4 text-[11px] font-semibold tracking-[0.2em] uppercase">
              Xavier School of Management
            </p>

            <span aria-hidden="true" className="bg-accent mt-3 h-0.5 w-10 rounded-full" />
          </div>

          <div className="surface-card rounded-2xl px-6 py-7 shadow-sm">{children}</div>

          <p className="text-muted-foreground mt-6 text-center text-xs leading-relaxed">
            Accounts are created by the programme office. If you cannot sign in, contact your
            administrator.
          </p>
        </div>
      </main>

      <footer className="text-muted-foreground border-t px-4 py-4 text-center text-[11px]">
        XLRI Xavier School of Management · IEV Activity Tracker
      </footer>
    </div>
  );
}
