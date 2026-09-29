import { Schema, type Model, type Types } from 'mongoose';
import { CONTENT_STATUSES, type ContentStatus } from '@/lib/constants/status';
import { durationInDays, isEndOnOrAfterStart } from '@/lib/utils/dates';
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

  /**
   * The shared Drive folder the cohort's presentations for this stage go into.
   * Which students have actually delivered one is recorded per student, on
   * `StudentVentureActivity.presentationReceivedAt`.
   */
  presentationFolderUrl?: string | null;

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

    presentationFolderUrl: { type: String, trim: true, default: null },

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
