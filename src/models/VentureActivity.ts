import { Schema, type Model, type Types } from 'mongoose';
import { CONTENT_STATUSES, type ContentStatus } from '@/lib/constants/status';
import { durationInDays, isEndOnOrAfterStart } from '@/lib/utils/dates';
import { DEFAULT_MAX_ATTEMPTS } from '@/lib/constants/activities';
import { registerModel } from './registerModel';

/** Master definition of the 12 Venture Activities. */
export interface IVentureActivity {
  _id: Types.ObjectId;
  activityCode: string;
  name: string;
  description?: string;
  termId: Types.ObjectId;
  order: number;

  startDate: Date;
  endDate: Date;
  /** Derived from the configured dates on every save; stored for reporting. */
  durationDays: number;

  maxAttempts: number;
  evidenceRequired: boolean;

  status: ContentStatus;

  createdAt: Date;
  updatedAt: Date;
}

const ventureActivitySchema = new Schema<IVentureActivity>(
  {
    activityCode: { type: String, required: true, trim: true, uppercase: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    termId: { type: Schema.Types.ObjectId, ref: 'Term', required: true },
    order: { type: Number, required: true, min: 1 },

    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    durationDays: { type: Number, required: true, min: 1, default: 1 },

    maxAttempts: { type: Number, required: true, min: 1, default: DEFAULT_MAX_ATTEMPTS },
    evidenceRequired: { type: Boolean, required: true, default: true },

    status: { type: String, required: true, enum: CONTENT_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true, collection: 'ventureactivities' },
);

ventureActivitySchema.index({ activityCode: 1 }, { unique: true });
ventureActivitySchema.index({ order: 1 }, { unique: true });
ventureActivitySchema.index({ termId: 1, order: 1 });

/**
 * The 12–15 day programme guideline is advisory and is NOT validated here —
 * only `endDate >= startDate` is enforced. Duration is recomputed from the
 * configured dates so it can never drift.
 */
ventureActivitySchema.pre('validate', async function syncDuration() {
  if (this.startDate && this.endDate) {
    if (!isEndOnOrAfterStart(this.startDate, this.endDate)) {
      throw new Error('Venture activity endDate must be on or after startDate');
    }
    this.durationDays = durationInDays(this.startDate, this.endDate);
  }
});

export const VentureActivity: Model<IVentureActivity> = registerModel<IVentureActivity>(
  'VentureActivity',
  ventureActivitySchema,
);
