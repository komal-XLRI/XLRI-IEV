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

  /**
   * The Google Form mentors fill in for this stage. Only its location is kept
   * here — the questions belong to Google Forms and can differ per stage.
   */
  feedbackForm?: IFeedbackFormConfig | null;

  status: ContentStatus;

  createdAt: Date;
  updatedAt: Date;
}

export interface IFeedbackFormConfig {
  /** The Google "pre-filled link" with {{IEV_TOKEN}} etc. as the answers. */
  prefillUrlTemplate: string;
  /** The `/forms/d/e/{id}` id, used to check a response came from this form. */
  publishedFormId: string;
  enabled: boolean;
  /** Counted mentor responses a received presentation needs to complete the stage. */
  requiredFeedbackCount: number;
  updatedBy?: Types.ObjectId | null;
  updatedAt?: Date | null;
}

const feedbackFormSchema = new Schema<IFeedbackFormConfig>(
  {
    prefillUrlTemplate: { type: String, required: true, trim: true },
    publishedFormId: { type: String, required: true, trim: true },
    enabled: { type: Boolean, required: true, default: true },
    requiredFeedbackCount: { type: Number, required: true, min: 1, max: 10, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);

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

    feedbackForm: { type: feedbackFormSchema, default: null },

    status: { type: String, required: true, enum: CONTENT_STATUSES, default: 'ACTIVE' },
  },
  { timestamps: true, collection: 'ventureactivities' },
);

ventureActivitySchema.index({ activityCode: 1 }, { unique: true });
ventureActivitySchema.index({ order: 1 }, { unique: true });
ventureActivitySchema.index({ termId: 1, order: 1 });
ventureActivitySchema.index({ 'feedbackForm.publishedFormId': 1 }, { sparse: true });

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
