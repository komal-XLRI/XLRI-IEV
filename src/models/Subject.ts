import { Schema, type Model, type Types } from 'mongoose';
import { CONTENT_STATUSES, type ContentStatus } from '@/lib/constants/status';
import { registerModel } from './registerModel';

export interface ISubject {
  _id: Types.ObjectId;
  code: string;
  name: string;
  credits: number;
  area?: string;
  termId: Types.ObjectId;
  description?: string;
  status: ContentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const subjectSchema = new Schema<ISubject>(
  {
    code: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    credits: { type: Number, required: true, min: 0, default: 3 },
    area: { type: String, trim: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    description: { type: String, trim: true },
    status: { type: String, required: true, enum: CONTENT_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true, collection: 'subjects' },
);

subjectSchema.index({ code: 1 }, { unique: true });
subjectSchema.index({ termId: 1, name: 1 });
subjectSchema.index({ status: 1 });

export const Subject: Model<ISubject> = registerModel<ISubject>('Subject', subjectSchema);
