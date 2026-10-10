import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth/currentUser';
import { PageHeader } from '@/components/layout/AppShell';
import { NotificationsList } from '@/components/layout/NotificationsList';
import { listNotifications } from '@/services/notifications/notificationService';
import { NOTIFICATION_TTL_DAYS } from '@/models';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireRole('STUDENT');
  const { items, unread } = await listNotifications(user, 200);

  return (
    <>
      <PageHeader
        title="Notifications"
        description={`Updates about your presentations, mentor feedback, HR & behaviour feedback, your stages and new workshops. Kept for ${NOTIFICATION_TTL_DAYS} days.`}
      />
      <NotificationsList items={items} unread={unread} />
    </>
  );
}
