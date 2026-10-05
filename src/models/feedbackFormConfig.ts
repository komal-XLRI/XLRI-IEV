import { Schema, type Types } from 'mongoose';

/**
 * The Google Form mentors fill in for one presentation. Only its location is
 * kept — the questions belong to Google Forms and can differ per presentation.
 */
export interface IFeedbackFormConfig {
  /** A name for the admin's own reference, e.g. the Google Form's title. */
  title?: string | null;
  /** The Google "pre-filled link" with {{IEV_TOKEN}} etc. as the answers. */
  prefillUrlTemplate: string;
  /** The `/forms/d/e/{id}` id, used to check a response came from this form. */
  publishedFormId: string;
  enabled: boolean;
  /** Counted mentor responses a received student needs to complete the stage. */
  requiredFeedbackCount: number;
  updatedBy?: Types.ObjectId | null;
  updatedAt?: Date | null;
}

export const feedbackFormConfigSchema = new Schema<IFeedbackFormConfig>(
  {
    title: { type: String, trim: true, default: null },
    prefillUrlTemplate: { type: String, required: true, trim: true },
    publishedFormId: { type: String, required: true, trim: true },
    enabled: { type: Boolean, required: true, default: true },
    requiredFeedbackCount: { type: Number, required: true, min: 1, max: 10, default: 1 },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedAt: { type: Date, default: null },
  },
  { _id: false },
);
