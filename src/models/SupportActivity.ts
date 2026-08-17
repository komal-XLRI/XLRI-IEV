import { Schema, type Model, type Types } from 'mongoose';
import { SUPPORT_SCHEDULE_TYPES, type SupportScheduleType } from '@/lib/constants/status';
import { registerModel } from './registerModel';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Master definition of the 8 Support Activities (A1–A8). */
export interface ISupportActivity {
  _id: Types.ObjectId;
  activityCode: string;
  name: string;
  description?: string;
  order: number;
  scheduleType: SupportScheduleType;

  /**
   * When this activity runs, for the ones that are not timetabled elsewhere.
   *
   * Optional by design. An `ACADEMIC_SESSION` activity is scheduled as a class,
   * and `SubjectSession` already holds its real date and time — filling these
   * in as well would create a second answer to the same question that nothing
   * keeps in step. The remaining schedule types (independent, field, weekend,
   * special) previously had nowhere at all to say when they happen, which is
   * the gap these fill.
   *
   * `startTime` / `endTime` are 24-hour `HH:mm` against `scheduledDate`, the
   * same shape `SubjectSession` and `Workshop` already use.
   */
  scheduledDate?: Date | null;
  startTime?: string | null;
  endTime?: string | null;

  createdAt: Date;
  updatedAt: Date;
}

const supportActivitySchema = new Schema<ISupportActivity>(
  {
    activityCode: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    order: { type: Number, required: true, min: 1 },
    scheduleType: {
      type: String,
      required: true,
      enum: SUPPORT_SCHEDULE_TYPES,
      default: 'INDEPENDENT',
    },

    scheduledDate: { type: Date, default: null },
    startTime: { type: String, trim: true, match: TIME_PATTERN, default: null },
    endTime: { type: String, trim: true, match: TIME_PATTERN, default: null },
  },
  { timestamps: true, collection: 'supportactivities' },
);

supportActivitySchema.index({ activityCode: 1 }, { unique: true });
supportActivitySchema.index({ order: 1 }, { unique: true });
supportActivitySchema.index({ scheduledDate: 1 });

/**
 * Schedule coherence, enforced at the collection rather than only in the form.
 *
 * A time with no date cannot be placed on a calendar, and an end before a start
 * is not a session — both are easier to write than to notice later.
 */
supportActivitySchema.pre('validate', function checkSchedule() {
  if ((this.startTime || this.endTime) && !this.scheduledDate) {
    throw new Error('Support activity startTime/endTime need a scheduledDate');
  }

  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    throw new Error('Support activity endTime must be after startTime');
  }
});

export const SupportActivity: Model<ISupportActivity> = registerModel<ISupportActivity>(
  'SupportActivity',
  supportActivitySchema,
);
