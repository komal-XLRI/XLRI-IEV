'use client';

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Bell, CheckCircle2, Info, OctagonAlert } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatTimeAgo } from '@/lib/utils/dates';
import {
  getBellDataAction,
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/actions/notifications';

export interface HeaderAlertItem {
  id: string;
  title: string;
  detail: string;
  href: string;
  tone: 'info' | 'warning' | 'danger';
}

export interface NotificationEntry {
  id: string;
  title: string;
  body: string | null;
  href: string | null;
  tone: 'info' | 'success' | 'warning';
  createdAt: string;
  read: boolean;
}

export interface BellNotifications {
  items: NotificationEntry[];
  unread: number;
}

const TONE = {
  info: { Icon: Info, chip: 'bg-info-soft text-info-soft-foreground' },
  success: { Icon: CheckCircle2, chip: 'bg-success-soft text-success-soft-foreground' },
  warning: { Icon: AlertTriangle, chip: 'bg-warning-soft text-warning-soft-foreground' },
  danger: { Icon: OctagonAlert, chip: 'bg-danger-soft text-danger-soft-foreground' },
} as const;

/** How often the bell checks for new notifications while the tab is visible. */
const REFRESH_MS = 60_000;

/**
 * Header bell. Two kinds of entry:
 *
 *   - "Needs attention" — live, worked out from the records now (a
 *     presentation today); it goes away by itself once dealt with;
 *   - notifications — things that happened (feedback in, a stage completed),
 *     stored per user with read / unread.
 *
 * The layout renders the first copy; the bell then refreshes itself — on
 * opening, on moving to another page, and once a minute — because a layout is
 * not re-rendered on navigation.
 */
export function NotificationsMenu({
  alerts: initialAlerts,
  notifications: initialNotifications,
  viewAllHref,
}: {
  alerts: HeaderAlertItem[];
  notifications?: BellNotifications;
  viewAllHref?: string;
}) {
  const [open, setOpen] = useState(false);
  const [alerts, setAlerts] = useState(initialAlerts);
  const [items, setItems] = useState(initialNotifications?.items ?? []);
  const [unread, setUnread] = useState(initialNotifications?.unread ?? 0);
  const [, startTransition] = useTransition();
  const containerRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const stored = initialNotifications !== undefined;

  const refresh = useCallback(() => {
    startTransition(async () => {
      const result = await getBellDataAction();
      if (!result.ok) return;
      setAlerts(result.data.alerts);
      setItems(result.data.items);
      setUnread(result.data.unread);
    });
  }, []);

  // Not on first render — the layout has just supplied fresh data.
  const firstPath = useRef(pathname);
  useEffect(() => {
    if (pathname === firstPath.current) return;
    firstPath.current = pathname;
    refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [refresh]);

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

  const markRead = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.read) return;
    setItems((list) => list.map((i) => (i.id === id ? { ...i, read: true } : i)));
    setUnread((n) => Math.max(0, n - 1));
    void markNotificationReadAction(id);
  };

  const markAllRead = () => {
    setItems((list) => list.map((i) => ({ ...i, read: true })));
    setUnread(0);
    startTransition(async () => {
      await markAllNotificationsReadAction();
    });
  };

  const count = alerts.length + unread;
  const empty = alerts.length === 0 && items.length === 0;

  return (
    <div ref={containerRef} className="relative" data-print="hide">
      <button
        type="button"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) refresh();
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={count === 0 ? 'Notifications: nothing new' : `Notifications: ${count} new`}
        title="Notifications"
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
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Notifications"
          className="surface-overlay rounded-control absolute right-0 z-40 mt-1.5 flex max-h-[min(32rem,calc(100vh-5rem))] w-[min(23rem,calc(100vw-2rem))] flex-col overflow-hidden"
        >
          <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
            <p className="text-[13px] font-semibold">Notifications</p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAllRead}
                className="text-primary text-[12px] font-medium hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {empty ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-7 text-center">
                <span className="bg-success-soft text-success-soft-foreground inline-flex size-8 items-center justify-center rounded-full">
                  <CheckCircle2 className="size-4" aria-hidden="true" />
                </span>
                <p className="text-[13px] font-semibold">You&rsquo;re all caught up</p>
                <p className="type-caption">Nothing new right now.</p>
              </div>
            ) : null}

            {alerts.length > 0 ? (
              <section>
                <p className="type-overline bg-surface-sunken border-b px-3 py-1.5">
                  Needs attention
                </p>
                <ul>
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
              </section>
            ) : null}

            {stored && items.length > 0 ? (
              <section>
                {alerts.length > 0 ? (
                  <p className="type-overline bg-surface-sunken border-y px-3 py-1.5">Recent</p>
                ) : null}
                <ul>
                  {items.map((item) => (
                    <li key={item.id} className="border-b last:border-b-0">
                      <NotificationRow
                        item={item}
                        onOpen={() => {
                          markRead(item.id);
                          setOpen(false);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          {stored && viewAllHref ? (
            <Link
              href={viewAllHref}
              role="menuitem"
              onClick={() => setOpen(false)}
              className="text-primary hover:bg-surface-hover border-t px-3 py-2 text-center text-[12.5px] font-medium transition-colors"
            >
              View all notifications
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** One stored notification: unread ones carry a dot and stronger text. */
export function NotificationRow({
  item,
  onOpen,
  roomy = false,
}: {
  item: NotificationEntry;
  onOpen: () => void;
  roomy?: boolean;
}) {
  const { Icon, chip } = TONE[item.tone];
  const className = cn(
    'hover:bg-surface-hover flex w-full items-start gap-2.5 text-left transition-colors',
    roomy ? 'px-4 py-3.5' : 'px-3 py-2.5',
    !item.read && 'bg-primary-soft/30',
  );
  const content = (
    <>
      <span
        className={cn(
          'mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md',
          chip,
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn('block text-[13px]', item.read ? 'font-medium' : 'font-semibold')}>
          {item.title}
        </span>
        {item.body ? <span className="type-caption block">{item.body}</span> : null}
        <span className="text-subtle-foreground mt-0.5 block text-[11px]">
          {formatTimeAgo(item.createdAt)}
        </span>
      </span>
      {!item.read ? (
        <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full">
          <span className="sr-only">Unread</span>
        </span>
      ) : null}
    </>
  );

  return item.href ? (
    <Link href={item.href} role="menuitem" onClick={onOpen} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" role="menuitem" onClick={onOpen} className={className}>
      {content}
    </button>
  );
}
