import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

export interface IFacultyProfile {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  designation?: string;
  department?: string;
  specialization?: string;
  bio?: string;
  createdAt: Date;
  updatedAt: Date;
}

const facultyProfileSchema = new Schema<IFacultyProfile>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    designation: { type: String, trim: true },
    department: { type: String, trim: true },
    specialization: { type: String, trim: true },
    bio: { type: String, trim: true },
  },
  { timestamps: true, collection: 'facultyprofiles' },
);

facultyProfileSchema.index({ userId: 1 }, { unique: true });
facultyProfileSchema.index({ department: 1 });

export const FacultyProfile: Model<IFacultyProfile> = registerModel<IFacultyProfile>(
  'FacultyProfile',
  facultyProfileSchema,
);
