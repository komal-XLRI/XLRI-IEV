'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export interface HeaderAlertItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: 'info' | 'warning' | 'danger';
}

const TONE = {
  info: { Icon: Info, chip: 'bg-info-soft text-info-soft-foreground' },
  warning: { Icon: AlertTriangle, chip: 'bg-warning-soft text-warning-soft-foreground' },
  danger: { Icon: OctagonAlert, chip: 'bg-danger-soft text-danger-soft-foreground' },
} as const;

/**
 * Header bell.
 *
 * These are not stored notifications — there is no notifications collection and
 * nothing to mark as read. Each entry is a live count of records that need
 * action, with the link that resolves them, so the badge can never disagree
 * with the data behind it or go stale.
 */
export function NotificationsMenu({ alerts }: { alerts: HeaderAlertItem[] }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const count = alerts.length;

  return (
    <div ref={containerRef} className="relative" data-print="hide">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          count === 0 ? 'Alerts: nothing needs attention' : `Alerts: ${count} need attention`
        }
        title="Alerts"
        className="text-muted-foreground border-input-border hover:bg-surface-hover hover:border-border-strong hover:text-foreground rounded-control relative inline-flex size-9 items-center justify-center border transition-colors"
      >
        <Bell className="size-4" aria-hidden="true" />
        {count > 0 ? (
          // A count, not a bare dot: the number is the information, and it
          // survives being seen in greyscale.
          <span
            aria-hidden="true"
            className="bg-danger text-danger-foreground absolute -top-1 -right-1 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] leading-4 font-semibold"
          >
            {count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Alerts"
          className="surface-overlay rounded-control absolute right-0 z-40 mt-1.5 w-[min(20rem,calc(100vw-2rem))] overflow-hidden"
        >
          <p className="type-overline border-b px-3 py-2">Needs attention</p>

          {count === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 py-7 text-center">
              <span className="bg-success-soft text-success-soft-foreground inline-flex size-8 items-center justify-center rounded-full">
                <CheckCircle2 className="size-4" aria-hidden="true" />
              </span>
              <p className="text-[13px] font-semibold">You&rsquo;re all caught up</p>
              <p className="type-caption">Nothing needs your attention right now.</p>
            </div>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {alerts.map((alert) => {
                const { Icon, chip } = TONE[alert.tone];

                return (
                  <li key={alert.id} className="border-b last:border-b-0">
                    <Link
                      href={alert.href}
                      role="menuitem"
                      onClick={() => setOpen(false)}
                      className="hover:bg-surface-hover flex items-start gap-2.5 px-3 py-2.5 transition-colors"
                    >
                      <span
                        className={cn(
                          'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md',
                          chip,
                        )}
                      >
                        <Icon className="size-3.5" aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{alert.title}</span>
                        <span className="type-caption block">{alert.detail}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
