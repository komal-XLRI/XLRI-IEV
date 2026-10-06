'use server';

import { requireAuth } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import { objectId } from '@/validators/common';
import { getHeaderAlerts, type HeaderAlert } from '@/services/dashboard/dashboardService';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from '@/services/notifications/notificationService';

export interface BellData {
  alerts: HeaderAlert[];
  items: NotificationItem[];
  unread: number;
}

/**
 * What the header bell shows. The layout renders it once; the bell calls this
 * to refresh, because a layout is not re-rendered when moving between pages.
 */
export async function getBellDataAction(): Promise<ActionResult<BellData>> {
  return runAction(async () => {
    const user = await requireAuth();
    const [alerts, notifications] = await Promise.all([
      getHeaderAlerts({ userId: user.userId, role: user.role }),
      listNotifications(user, 10),
    ]);
    return { alerts, ...notifications };
  });
}

export async function markNotificationReadAction(id: string): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireAuth();
    await markNotificationRead(user, objectId.parse(id));
    return null;
  });
}

export async function markAllNotificationsReadAction(): Promise<ActionResult<null>> {
  return runAction(async () => {
    const user = await requireAuth();
    await markAllNotificationsRead(user);
    return null;
  });
}
