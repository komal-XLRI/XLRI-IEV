import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/** Who a notification is for: one user, every administrator, or every student. */
export const NOTIFICATION_AUDIENCES = ['USER', 'ADMINS', 'STUDENTS'] as const;
export type NotificationAudience = (typeof NOTIFICATION_AUDIENCES)[number];

export const NOTIFICATION_TONES = ['info', 'success', 'warning'] as const;
export type NotificationTone = (typeof NOTIFICATION_TONES)[number];

/** How long a notification is kept before Mongo's TTL monitor removes it. */
export const NOTIFICATION_TTL_DAYS = 120;

/**
 * Something that happened, told to the people it concerns — a presentation
 * scheduled, feedback in, a stage completed.
 *
 * A notification for one user has `audience: 'USER'` and `recipientId`. One
 * for a whole group (every administrator, every student) is stored once with
 * no recipient. Either way, `readBy` holds the users who have read it, so a
 * group notification read by one administrator stays unread for the others.
 */
export interface INotification {
  _id: Types.ObjectId;
  audience: NotificationAudience;
  recipientId: Types.ObjectId | null;
  /** What happened, as a stable key — `presentation.scheduled`, `feedback.received`. */
  kind: string;
  title: string;
  body: string | null;
  /** Where the notification leads. Always an in-app path. */
  href: string | null;
  tone: NotificationTone;
  readBy: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    audience: { type: String, required: true, enum: NOTIFICATION_AUDIENCES },
    recipientId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    kind: { type: String, required: true, trim: true, maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: null, trim: true, maxlength: 600 },
    href: { type: String, default: null, trim: true, maxlength: 300 },
    tone: { type: String, required: true, enum: NOTIFICATION_TONES, default: 'info' },
    readBy: { type: [Schema.Types.ObjectId], ref: 'User', default: [] },
  },
  { timestamps: true },
);

notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ audience: 1, createdAt: -1 });
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: NOTIFICATION_TTL_DAYS * 24 * 60 * 60 },
);

export const Notification: Model<INotification> = registerModel<INotification>(
  'Notification',
  notificationSchema,
);
