import { Schema, type Model, type Types } from 'mongoose';
import {
  REVIEW_STATUSES,
  STUDENT_ACTIVITY_STATUSES,
  VENTURE_ATTENDANCE_STATUSES,
  type ReviewStatus,
  type StudentActivityStatus,
  type VentureAttendanceStatus,
} from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * A student's progress through one Venture Activity.
 *
 * `facultyId` / `mentorId` mirror the venture's *current* assignment.
 * `reviewFacultyId` / `reviewMentorId` snapshot who actually reviewed this
 * activity, so reassigning the venture later does not rewrite history.
 * The immutable review record itself lives in the Reviews collection.
 */
export interface IStudentVentureActivity {
  _id: Types.ObjectId;

  studentVentureId: Types.ObjectId;
  ventureActivityId: Types.ObjectId;

  facultyId?: Types.ObjectId | null;
  mentorId?: Types.ObjectId | null;

  reviewFacultyId?: Types.ObjectId | null;
  reviewMentorId?: Types.ObjectId | null;

  /** Number of submissions made so far. 0 until the first submission. */
  attemptNumber: number;

  status: StudentActivityStatus;

  /**
   * Whether the student turned up for this activity.
   *
   * Deliberately independent of `status`: attendance is a fact recorded by the
   * programme office, while `status` is derived from submissions and reviews.
   * Marking someone absent neither blocks a submission nor fails an activity —
   * nothing in the progression, attempt or dual-review rules reads this field.
   */
  attendanceStatus: VentureAttendanceStatus;

  facultyReviewStatus: ReviewStatus;
  mentorReviewStatus: ReviewStatus;

  /** Submission currently awaiting review, if any. */
  currentSubmissionId?: Types.ObjectId | null;

  startedAt?: Date | null;
  completedAt?: Date | null;

  createdAt: Date;
  updatedAt: Date;
}

const studentVentureActivitySchema = new Schema<IStudentVentureActivity>(
  {
    studentVentureId: { type: Schema.Types.ObjectId, ref: 'StudentVenture', required: true },
    ventureActivityId: { type: Schema.Types.ObjectId, ref: 'VentureActivity', required: true },

    facultyId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    mentorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    reviewFacultyId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewMentorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    attemptNumber: { type: Number, required: true, min: 0, default: 0 },

    status: {
      type: String,
      required: true,
      enum: STUDENT_ACTIVITY_STATUSES,
      default: 'NOT_STARTED',
    },

    attendanceStatus: {
      type: String,
      required: true,
      enum: VENTURE_ATTENDANCE_STATUSES,
      default: 'PENDING',
    },

    facultyReviewStatus: {
      type: String,
      required: true,
      enum: REVIEW_STATUSES,
      default: 'PENDING',
    },
    mentorReviewStatus: { type: String, required: true, enum: REVIEW_STATUSES, default: 'PENDING' },

    currentSubmissionId: { type: Schema.Types.ObjectId, ref: 'VentureSubmission', default: null },

    startedAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true, collection: 'studentventureactivities' },
);

studentVentureActivitySchema.index({ studentVentureId: 1, ventureActivityId: 1 }, { unique: true });
studentVentureActivitySchema.index({ facultyId: 1, facultyReviewStatus: 1 });
studentVentureActivitySchema.index({ mentorId: 1, mentorReviewStatus: 1 });
studentVentureActivitySchema.index({ status: 1 });
studentVentureActivitySchema.index({ ventureActivityId: 1, attendanceStatus: 1 });

export const StudentVentureActivity: Model<IStudentVentureActivity> =
  registerModel<IStudentVentureActivity>('StudentVentureActivity', studentVentureActivitySchema);
