import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

export interface IMentorProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  company?: string;
  designation?: string;
  industry?: string;
  expertise?: string;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}

const mentorProfileSchema = new Schema<IMentorProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    company: { type: String, trim: true },
    designation: { type: String, trim: true },
    industry: { type: String, trim: true },
    expertise: { type: String, trim: true },
    bio: { type: String, trim: true },
  },
  { timestamps: true, collection: 'mentorprofiles' },
);

mentorProfileSchema.index({ userId: 1 }, { unique: true });
mentorProfileSchema.index({ industry: 1 });

export const MentorProfile: Model<IMentorProfile> = registerModel<IMentorProfile>(
  'MentorProfile',
  mentorProfileSchema,
);
