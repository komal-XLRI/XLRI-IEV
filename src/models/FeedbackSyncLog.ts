import { Schema, type Model, type Types } from 'mongoose';
import { registerModel } from './registerModel';

export const FEEDBACK_SYNC_OUTCOMES = ['ACCEPTED', 'UPDATED', 'REJECTED'] as const;
export type FeedbackSyncOutcome = (typeof FEEDBACK_SYNC_OUTCOMES)[number];

/**
 * One inbound call from the Google Apps Script that passed signature
 * verification, whatever became of it. This is where "the mentor says they
 * submitted but nothing shows" gets answered.
 *
 * Never holds the secret, and only the first characters of a token — enough to
 * tell two presentations apart in a log, not enough to use.
 */
export interface IFeedbackSyncLog {
  _id: Types.ObjectId;
  outcome: FeedbackSyncOutcome;
  /** Machine-readable reason for a rejection, e.g. PRESENTATION_NOT_RECEIVED. */
  reason?: string | null;
  googleResponseId?: string | null;
  publishedFormId?: string | null;
  tokenPrefix?: string | null;
  studentVentureActivityId?: Types.ObjectId | null;
  participantId?: Types.ObjectId | null;
  mentorFeedbackId?: Types.ObjectId | null;
  createdAt: Date;
}

const feedbackSyncLogSchema = new Schema<IFeedbackSyncLog>(
  {
    outcome: { type: String, required: true, enum: FEEDBACK_SYNC_OUTCOMES },
    reason: { type: String, default: null },
    googleResponseId: { type: String, default: null },
    publishedFormId: { type: String, default: null },
    tokenPrefix: { type: String, default: null },
    studentVentureActivityId: {
      type: Schema.Types.ObjectId,
      ref: 'StudentVentureActivity',
      default: null,
    },
    participantId: { type: Schema.Types.ObjectId, ref: 'PresentationParticipant', default: null },
    mentorFeedbackId: { type: Schema.Types.ObjectId, ref: 'MentorFeedback', default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false }, collection: 'feedbacksynclogs' },
);

// Diagnostic data, not a record of anything: kept for about six months.
feedbackSyncLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });
feedbackSyncLogSchema.index({ googleResponseId: 1 });
feedbackSyncLogSchema.index({ outcome: 1, createdAt: -1 });

export const FeedbackSyncLog: Model<IFeedbackSyncLog> = registerModel<IFeedbackSyncLog>(
  'FeedbackSyncLog',
  feedbackSyncLogSchema,
);
