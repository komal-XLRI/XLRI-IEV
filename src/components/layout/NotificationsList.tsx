'use client';

import { useState, useTransition } from 'react';
import { BellOff, CheckCheck } from 'lucide-react';
import { Card, EmptyState } from '@/components/ui/Card';
import { cn } from '@/lib/utils/cn';
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from '@/app/actions/notifications';
import { NotificationRow, type NotificationEntry } from './NotificationsMenu';

/** The full notifications page: every notification kept, newest first. */
export function NotificationsList({
  items: initialItems,
  unread: initialUnread,
}: {
  items: NotificationEntry[];
  unread: number;
}) {
  const [items, setItems] = useState(initialItems);
  const [unread, setUnread] = useState(initialUnread);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [, startTransition] = useTransition();

  const shown = filter === 'unread' ? items.filter((i) => !i.read) : items;

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

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <div className="rounded-control inline-flex border p-0.5" role="tablist">
          {(['all', 'unread'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={filter === value}
              onClick={() => setFilter(value)}
              className={cn(
                'rounded-[calc(var(--radius-control)-2px)] px-3 py-1 text-[12.5px] font-medium transition-colors',
                filter === value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {value === 'all' ? 'All' : `Unread${unread > 0 ? ` (${unread})` : ''}`}
            </button>
          ))}
        </div>
        {unread > 0 ? (
          <button
            type="button"
            onClick={markAllRead}
            className="text-primary inline-flex items-center gap-1.5 text-[13px] font-medium hover:underline"
          >
            <CheckCheck className="size-4" aria-hidden="true" />
            Mark all read
          </button>
        ) : null}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon={BellOff}
          title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          description={
            filter === 'unread'
              ? 'You have read everything.'
              : 'Updates about presentations, feedback and your stages will appear here.'
          }
        />
      ) : (
        <ul className="divide-y">
          {shown.map((item) => (
            <li key={item.id}>
              <NotificationRow item={item} roomy onOpen={() => markRead(item.id)} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
