import { Schema, type Model, type Types } from 'mongoose';
import {
  REVIEW_STATUSES,
  STUDENT_ACTIVITY_STATUSES,
  type ReviewStatus,
  type StudentActivityStatus,
} from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * A student's progress through one Venture Activity.
 *
 * Attendance is deliberately NOT here. It lives in `VentureActivityAttendance`,
 * one row per date, because an activity runs for days and can be attended more
 * than once — and because a register needs to record who marked it and when,
 * which a column on this document could not do without disturbing `updatedAt`,
 * which the review queue reads as "waiting since".
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

export const StudentVentureActivity: Model<IStudentVentureActivity> =
  registerModel<IStudentVentureActivity>('StudentVentureActivity', studentVentureActivitySchema);
