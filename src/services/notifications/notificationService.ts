import 'server-only';
import { Types, type QueryFilter } from 'mongoose';
import { connectToDatabase } from '@/lib/db/mongoose';
import {
  Notification,
  StudentVenture,
  StudentVentureActivity,
  User,
  VentureActivity,
  type INotification,
  type NotificationAudience,
  type NotificationTone,
} from '@/models';
import { logger } from '@/lib/logger';
import type { Role } from '@/lib/constants/roles';

export interface NotificationInput {
  kind: string;
  title: string;
  body?: string | null;
  href?: string | null;
  tone?: NotificationTone;
}

/**
 * Stores notifications. Never throws: a notification is a courtesy on top of
 * something that has already happened, and failing to write one must never
 * undo or fail the action that caused it.
 */
async function store(
  rows: Array<NotificationInput & { audience: NotificationAudience; recipientId?: string | null }>,
) {
  if (rows.length === 0) return;
  try {
    await connectToDatabase();
    await Notification.insertMany(
      rows.map((row) => ({
        audience: row.audience,
        recipientId: row.recipientId ? new Types.ObjectId(row.recipientId) : null,
        kind: row.kind,
        title: row.title,
        body: row.body ?? null,
        href: row.href ?? null,
        tone: row.tone ?? 'info',
      })),
    );
  } catch (error) {
    logger.warn('Notification write failed', {
      kinds: [...new Set(rows.map((r) => r.kind))],
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Tells one user. */
export function notifyUser(userId: string, input: NotificationInput) {
  return store([{ ...input, audience: 'USER', recipientId: userId }]);
}

/** Tells every administrator, once — each one reads it for themselves. */
export function notifyAdmins(input: NotificationInput) {
  return store([{ ...input, audience: 'ADMINS' }]);
}

/** Tells every student, once. */
export function notifyStudents(input: NotificationInput) {
  return store([{ ...input, audience: 'STUDENTS' }]);
}

export interface StageRecordContext {
  recordId: string;
  studentId: string;
  studentName: string;
  ventureName: string;
  activityId: string;
  stageLabel: string;
}

/**
 * Who a stage record belongs to and what the stage is called — what nearly
 * every notification about a student's stage needs to say. Null when any
 * part is missing (a deleted student, say); the caller then sends nothing.
 */
export async function stageRecordContext(recordIds: string[]): Promise<StageRecordContext[]> {
  if (recordIds.length === 0) return [];
  try {
    await connectToDatabase();
    const records = await StudentVentureActivity.find({ _id: { $in: recordIds } })
      .select('_id studentVentureId ventureActivityId')
      .lean()
      .exec();
    const [ventures, activities] = await Promise.all([
      StudentVenture.find({ _id: { $in: records.map((r) => r.studentVentureId) } })
        .select('_id studentId ventureName')
        .lean()
        .exec(),
      VentureActivity.find({ _id: { $in: records.map((r) => r.ventureActivityId) } })
        .select('_id activityCode name')
        .lean()
        .exec(),
    ]);
    const users = await User.find({ _id: { $in: ventures.map((v) => v.studentId) } })
      .select('_id name')
      .lean()
      .exec();
    const ventureById = new Map(ventures.map((v) => [v._id.toString(), v]));
    const activityById = new Map(activities.map((a) => [a._id.toString(), a]));
    const userById = new Map(users.map((u) => [u._id.toString(), u]));

    return records.flatMap((record) => {
      const venture = ventureById.get(record.studentVentureId.toString());
      const activity = activityById.get(record.ventureActivityId.toString());
      const user = venture ? userById.get(venture.studentId.toString()) : undefined;
      if (!venture || !activity || !user) return [];
      return [
        {
          recordId: record._id.toString(),
          studentId: user._id.toString(),
          studentName: user.name,
          ventureName: venture.ventureName,
          activityId: activity._id.toString(),
          stageLabel: `${activity.activityCode} · ${activity.name}`,
        },
      ];
    });
  } catch (error) {
    logger.warn('Notification context lookup failed', {
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

// ------------------------------------------------------------- Reading ----

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  tone: NotificationTone;
  createdAt: string;
  read: boolean;
}

/**
 * Everything a user is shown: their own, plus their group's — but only group
 * notifications sent since their account was created, so a student added
 * mid-programme does not open to a backlog of old workshop announcements.
 */
async function visibleTo(user: {
  userId: string;
  role: Role;
}): Promise<QueryFilter<INotification>> {
  const own: QueryFilter<INotification> = {
    audience: 'USER',
    recipientId: new Types.ObjectId(user.userId),
  };
  const group = user.role === 'ADMIN' ? 'ADMINS' : user.role === 'STUDENT' ? 'STUDENTS' : null;
  if (!group) return own;

  const account = await User.findById(user.userId).select('createdAt').lean().exec();
  const since = account?.createdAt ?? new Date(0);
  return { $or: [own, { audience: group, createdAt: { $gte: since } }] };
}

export async function listNotifications(
  user: { userId: string; role: Role },
  limit = 20,
): Promise<{ items: NotificationItem[]; unread: number }> {
  await connectToDatabase();
  const me = new Types.ObjectId(user.userId);
  const filter = await visibleTo(user);

  const [docs, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).limit(limit).lean().exec(),
    Notification.countDocuments({ ...filter, readBy: { $ne: me } }).exec(),
  ]);

  return {
    unread,
    items: docs.map((doc) => ({
      id: doc._id.toString(),
      kind: doc.kind,
      title: doc.title,
      body: doc.body ?? null,
      href: doc.href ?? null,
      tone: doc.tone,
      createdAt: doc.createdAt.toISOString(),
      read: doc.readBy.some((id) => id.equals(me)),
    })),
  };
}

/** Marks one notification read — only one the user can actually see. */
export async function markNotificationRead(user: { userId: string; role: Role }, id: string) {
  await connectToDatabase();
  await Notification.updateOne(
    { _id: new Types.ObjectId(id), ...(await visibleTo(user)) },
    { $addToSet: { readBy: new Types.ObjectId(user.userId) } },
  ).exec();
}

export async function markAllNotificationsRead(user: { userId: string; role: Role }) {
  await connectToDatabase();
  const me = new Types.ObjectId(user.userId);
  await Notification.updateMany(
    { ...(await visibleTo(user)), readBy: { $ne: me } },
    { $addToSet: { readBy: me } },
  ).exec();
}
