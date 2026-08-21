import { Schema, type Model, type Types } from 'mongoose';
import { ATTENDANCE_MARKS, type AttendanceMark } from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * Attendance on a Venture Activity, on a given date.
 *
 * Modelled on `SubjectAttendance`, which answers the same shape of question
 * for a class: a row exists only once somebody has marked it, it names who
 * marked it and when, and it is keyed by the occasion rather than by the
 * enrolment.
 *
 * The occasion here is a *date* rather than a session id, because a Venture
 * Activity is a work window of twelve to nineteen days, not a timetabled slot.
 * A single activity can therefore carry several attendance dates — a kickoff,
 * a mid-point check-in, a demo — which the previous single-field design could
 * not represent at all.
 *
 * Nothing in this collection participates in progression, attempts or the
 * dual-review rule. It is a register, and deliberately references no
 * submission or review.
 */
export interface IVentureActivityAttendance {
  _id: Types.ObjectId;

  ventureActivityId: Types.ObjectId;
  studentVentureId: Types.ObjectId;

  /** Midnight UTC on the day the register was taken. */
  date: Date;

  status: AttendanceMark;

  markedAt: Date;
  markedBy: Types.ObjectId;
  remarks?: string;

  createdAt: Date;
  updatedAt: Date;
}

const ventureActivityAttendanceSchema = new Schema<IVentureActivityAttendance>(
  {
    ventureActivityId: {
      type: Schema.Types.ObjectId,
      ref: 'VentureActivity',
      required: true,
    },
    studentVentureId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentVenture',
      required: true,
    },

    date: { type: Date, required: true },

    status: { type: String, required: true, enum: ATTENDANCE_MARKS },

    // Required, not optional: a mark nobody is accountable for is the thing
    // that cannot be defended when a student disputes an absence.
    markedAt: { type: Date, required: true, default: () => new Date() },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    remarks: { type: String, trim: true, maxlength: 300 },
  },
  { timestamps: true, collection: 'ventureactivityattendances' },
);

/**
 * One mark per venture, per activity, per date.
 *
 * The unique index is what makes re-marking an edit rather than a duplicate,
 * so saving the same register twice corrects it instead of doubling the count.
 */
ventureActivityAttendanceSchema.index(
  { ventureActivityId: 1, studentVentureId: 1, date: 1 },
  { unique: true },
);

// Taking a register: every mark for one activity on one date.
ventureActivityAttendanceSchema.index({ ventureActivityId: 1, date: -1 });
// A student's own history, newest first.
ventureActivityAttendanceSchema.index({ studentVentureId: 1, date: -1 });
// Reporting across a date range.
ventureActivityAttendanceSchema.index({ date: -1 });

/**
 * Dates are compared and grouped, never displayed from a timestamp, so they
 * are stored at midnight UTC. Without this, two registers taken on the same
 * day at different hours are different dates to the unique index, and the
 * second one silently becomes a duplicate rather than an edit.
 */
export function attendanceDay(value: Date | string): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  );
}

ventureActivityAttendanceSchema.pre('validate', function normaliseDate() {
  if (this.date) this.date = attendanceDay(this.date);
});

export const VentureActivityAttendance: Model<IVentureActivityAttendance> =
  registerModel<IVentureActivityAttendance>(
    'VentureActivityAttendance',
    ventureActivityAttendanceSchema,
  );
