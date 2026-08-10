import { Schema, type Model, type Types } from 'mongoose';
import { SUPPORT_ACTIVITY_STATUSES, type SupportActivityStatus } from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * A student's engagement with a Support Activity.
 *
 * Deliberately lightweight: some support activities are participation records
 * (a visit attended) rather than formal submissions, so there is no attempt
 * limit or dual-review requirement here.
 */
export interface IStudentSupportActivity {
  _id: Types.ObjectId;

  studentVentureId: Types.ObjectId;
  supportActivityId: Types.ObjectId;

  facultyId?: Types.ObjectId | null;
  mentorId?: Types.ObjectId | null;

  reviewFacultyId?: Types.ObjectId | null;
  reviewMentorId?: Types.ObjectId | null;

  attemptNumber: number;
  submittedAt?: Date | null;

  notes?: string;

  status: SupportActivityStatus;

  createdAt: Date;
  updatedAt: Date;
}

const studentSupportActivitySchema = new Schema<IStudentSupportActivity>(
  {
    studentVentureId: { type: Schema.Types.ObjectId, ref: 'StudentVenture', required: true },
    supportActivityId: { type: Schema.Types.ObjectId, ref: 'SupportActivity', required: true },

    facultyId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    mentorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    reviewFacultyId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewMentorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    attemptNumber: { type: Number, required: true, min: 0, default: 0 },
    submittedAt: { type: Date, default: null },

    notes: { type: String, trim: true },

    status: {
      type: String,
      required: true,
      enum: SUPPORT_ACTIVITY_STATUSES,
      default: 'PENDING',
    },
  },
  { timestamps: true, collection: 'studentsupportactivities' },
);

studentSupportActivitySchema.index({ studentVentureId: 1, supportActivityId: 1 }, { unique: true });
studentSupportActivitySchema.index({ status: 1 });

export const StudentSupportActivity: Model<IStudentSupportActivity> =
  registerModel<IStudentSupportActivity>('StudentSupportActivity', studentSupportActivitySchema);
