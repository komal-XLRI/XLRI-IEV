import { Schema, type Model, type Types } from 'mongoose';
import { SESSION_TYPES, type SessionType } from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * A scheduled class for a subject.
 *
 * Expert Workshops (Support Activity A7) are modelled here via
 * `supportActivityId` rather than in a separate Workshop collection:
 *
 *   SupportActivity A7 → SubjectSession → Subject
 */
export interface ISubjectSession {
  _id: Types.ObjectId;
  subjectId: Types.ObjectId;
  facultyId: Types.ObjectId;
  date: Date;
  /** 24-hour "HH:mm". */
  startTime: string;
  endTime: string;
  sessionType: SessionType;
  /** Set when this session also delivers a Support Activity (e.g. A7). */
  supportActivityId?: Types.ObjectId | null;
  topic?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const subjectSessionSchema = new Schema<ISubjectSession>(
  {
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true },
    facultyId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: Date, required: true },
    startTime: { type: String, required: true, match: TIME_PATTERN },
    endTime: { type: String, required: true, match: TIME_PATTERN },
    sessionType: { type: String, required: true, enum: SESSION_TYPES, default: 'LECTURE' },
    supportActivityId: { type: Schema.Types.ObjectId, ref: 'SupportActivity', default: null },
    topic: { type: String, trim: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true, collection: 'subjectsessions' },
);

subjectSessionSchema.index({ subjectId: 1, date: 1 });
subjectSessionSchema.index({ facultyId: 1, date: 1 });
subjectSessionSchema.index({ supportActivityId: 1, date: 1 });

subjectSessionSchema.pre('validate', async function validateTimeOrder() {
  if (this.startTime && this.endTime && this.endTime <= this.startTime) {
    throw new Error('Session endTime must be after startTime');
  }
});

export const SubjectSession: Model<ISubjectSession> = registerModel<ISubjectSession>(
  'SubjectSession',
  subjectSessionSchema,
);
