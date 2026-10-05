import { Schema, type Model, type Types } from 'mongoose';
import { PRESENTATION_STATUSES, type PresentationStatus } from '@/lib/constants/presentations';
import { feedbackFormConfigSchema, type IFeedbackFormConfig } from './feedbackFormConfig';
import { registerModel } from './registerModel';

/**
 * One presentation sitting within a stage: a date, the students scheduled to
 * present, and the Drive link their decks go into. A stage has as many of
 * these as the administrator creates; none ever replaces another.
 *
 * The students are `PresentationParticipant` rows, one per student, because
 * each carries its own received mark, QR token and feedback.
 */
export interface IPresentation {
  _id: Types.ObjectId;

  ventureActivityId: Types.ObjectId;

  /** The day of the presentation, stored as UTC midnight. */
  presentedOn: Date;
  /** "HH:MM", 24-hour; optional. */
  startTime?: string | null;

  driveUrl?: string | null;

  status: PresentationStatus;

  /**
   * The Google Form mentors fill in for this presentation. Each presentation
   * has its own; none is inherited from the stage or another presentation.
   */
  feedbackForm?: IFeedbackFormConfig | null;

  /** Created by the one-off migration from the old per-stage checklist. */
  migratedFromChecklist: boolean;

  createdBy?: Types.ObjectId | null;
  updatedBy?: Types.ObjectId | null;

  createdAt: Date;
  updatedAt: Date;
}

const presentationSchema = new Schema<IPresentation>(
  {
    ventureActivityId: { type: Schema.Types.ObjectId, ref: 'VentureActivity', required: true },

    presentedOn: { type: Date, required: true },
    startTime: { type: String, trim: true, default: null },

    driveUrl: { type: String, trim: true, default: null },

    status: { type: String, required: true, enum: PRESENTATION_STATUSES, default: 'SCHEDULED' },

    feedbackForm: { type: feedbackFormConfigSchema, default: null },

    migratedFromChecklist: { type: Boolean, required: true, default: false },

    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'presentations' },
);

presentationSchema.index({ ventureActivityId: 1, presentedOn: 1 });
presentationSchema.index({ 'feedbackForm.publishedFormId': 1 }, { sparse: true });

export const Presentation: Model<IPresentation> = registerModel<IPresentation>(
  'Presentation',
  presentationSchema,
);
