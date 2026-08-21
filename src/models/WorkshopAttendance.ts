import { Schema, type Model, type Types } from 'mongoose';
import { ATTENDANCE_MARKS, type AttendanceMark } from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * Who turned up to a workshop.
 *
 * Deliberately shaped differently from `VentureActivityAttendance`, because a
 * workshop is a different kind of thing:
 *
 * There is no `date`. A Venture Activity is a window of twelve to nineteen
 * days and can be registered many times, so its rows are keyed by date. A
 * workshop *is* a date — one `date`, one `startTime`, one `endTime` — so the
 * workshop identifies the occasion by itself. Adding a date here would let one
 * student be marked twice for the same workshop on different days, a state
 * with no meaning that every count would then have to defend against.
 *
 * It is keyed on the student, not on their venture. A workshop is attended by
 * a person; a student without a venture still attends, and keying on
 * `studentVentureId` would drop exactly those people from the register.
 *
 * What it keeps from the Venture Activity register is what matters: Present
 * and Absent are the only two marks, a row exists only once somebody has
 * marked it — so unmarked is the absence of a record and is never counted as
 * an absence — and every row says who marked it and when.
 *
 * Like everything else in the attendance system, it gates nothing. A workshop
 * absence locks no activity, consumes no attempt and reaches no review.
 */
export interface IWorkshopAttendance {
  _id: Types.ObjectId;

  workshopId: Types.ObjectId;
  /** The student who attended. A `User` with role STUDENT. */
  studentId: Types.ObjectId;

  status: AttendanceMark;

  remarks?: string;

  markedAt: Date;
  markedBy: Types.ObjectId;

  createdAt: Date;
  updatedAt: Date;
}

const workshopAttendanceSchema = new Schema<IWorkshopAttendance>(
  {
    workshopId: {
      type: Schema.Types.ObjectId,
      ref: 'Workshop',
      required: true,
    },
    studentId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    status: { type: String, required: true, enum: ATTENDANCE_MARKS },

    remarks: { type: String, trim: true, maxlength: 300 },

    // Required, not defaulted-and-optional: "who said so, and when" is the
    // question a disputed absence asks, and a row that cannot answer it is
    // worse than no row at all.
    markedAt: { type: Date, required: true, default: () => new Date() },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true, collection: 'workshopattendances' },
);

/**
 * One mark per student per workshop.
 *
 * This is what makes re-marking an edit rather than a duplicate, so "fix the
 * register afterwards" needs no separate update path — the same save runs
 * again and corrects itself.
 */
workshopAttendanceSchema.index({ workshopId: 1, studentId: 1 }, { unique: true });

/** Counting a workshop's register, and reading one student's history. */
workshopAttendanceSchema.index({ workshopId: 1, status: 1 });
workshopAttendanceSchema.index({ studentId: 1 });

export const WorkshopAttendance: Model<IWorkshopAttendance> = registerModel<IWorkshopAttendance>(
  'WorkshopAttendance',
  workshopAttendanceSchema,
);
