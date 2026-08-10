import { Schema, type Model, type Types } from 'mongoose';
import { ATTENDANCE_STATUSES, type AttendanceStatus } from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * Optional per-session attendance. No mandatory-attendance rule is enforced
 * anywhere in the system — that policy has not been finalised.
 */
export interface ISubjectAttendance {
  _id: Types.ObjectId;
  sessionId: Types.ObjectId;
  studentId: Types.ObjectId;
  status: AttendanceStatus;
  markedAt: Date;
  markedBy: Types.ObjectId;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const subjectAttendanceSchema = new Schema<ISubjectAttendance>(
  {
    sessionId: { type: Schema.Types.ObjectId, ref: 'SubjectSession', required: true },
    studentId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: { type: String, required: true, enum: ATTENDANCE_STATUSES },
    markedAt: { type: Date, required: true, default: () => new Date() },
    markedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    remarks: { type: String, trim: true },
  },
  { timestamps: true, collection: 'subjectattendances' },
);

subjectAttendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });
subjectAttendanceSchema.index({ studentId: 1 });

export const SubjectAttendance: Model<ISubjectAttendance> = registerModel<ISubjectAttendance>(
  'SubjectAttendance',
  subjectAttendanceSchema,
);
