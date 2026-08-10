import { Schema, type Model, type Types } from 'mongoose';
import { SUPPORT_SCHEDULE_TYPES, type SupportScheduleType } from '@/lib/constants/status';
import { registerModel } from './registerModel';

/** Master definition of the 8 Support Activities (A1–A8). */
export interface ISupportActivity {
  _id: Types.ObjectId;
  activityCode: string;
  name: string;
  description?: string;
  order: number;
  scheduleType: SupportScheduleType;
  createdAt: Date;
  updatedAt: Date;
}

const supportActivitySchema = new Schema<ISupportActivity>(
  {
    activityCode: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    order: { type: Number, required: true, min: 1 },
    scheduleType: {
      type: String,
      required: true,
      enum: SUPPORT_SCHEDULE_TYPES,
      default: 'INDEPENDENT',
    },
  },
  { timestamps: true, collection: 'supportactivities' },
);

supportActivitySchema.index({ activityCode: 1 }, { unique: true });
supportActivitySchema.index({ order: 1 }, { unique: true });

export const SupportActivity: Model<ISupportActivity> = registerModel<ISupportActivity>(
  'SupportActivity',
  supportActivitySchema,
);
