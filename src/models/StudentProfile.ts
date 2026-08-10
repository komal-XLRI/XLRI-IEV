import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

/** Student-specific data. Name/email/phone live on the User document only. */
export interface IStudentProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  rollNumber: string;
  batch: string;
  cluster?: string;
  background?: string;
  strengths?: string;
  weakness?: string;
  personalContext?: string;
  createdAt: Date;
  updatedAt: Date;
}

const studentProfileSchema = new Schema<IStudentProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    rollNumber: { type: String, required: true, trim: true, uppercase: true },
    batch: { type: String, required: true, trim: true },
    cluster: { type: String, trim: true },
    background: { type: String, trim: true },
    strengths: { type: String, trim: true },
    weakness: { type: String, trim: true },
    personalContext: { type: String, trim: true },
  },
  { timestamps: true, collection: 'studentprofiles' },
);

studentProfileSchema.index({ userId: 1 }, { unique: true });
studentProfileSchema.index({ rollNumber: 1 }, { unique: true });
studentProfileSchema.index({ batch: 1 });

export const StudentProfile: Model<IStudentProfile> = registerModel<IStudentProfile>(
  'StudentProfile',
  studentProfileSchema,
);
