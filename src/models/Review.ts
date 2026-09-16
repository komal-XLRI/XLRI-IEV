import { Schema, type Model, type Types } from 'mongoose';
import {
  REVIEW_DECISIONS,
  REVIEWER_TYPES,
  type ReviewDecision,
  type ReviewerType,
} from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * Review history. A fully reviewed submission has exactly two entries — one
 * FACULTY, one MENTOR.
 *
 * A reviewer cannot change or withdraw their own verdict: for them a changed
 * mind is expressed by a new submission attempt, which is what keeps the
 * record an account of what happened rather than of what people wish had.
 *
 * An administrator can, because the programme office is the only party able to
 * fix a verdict entered against the wrong student or with the wrong decision,
 * and the alternative — leaving it wrong — is worse than the edit. Every such
 * change names who made it and recomputes the activity it affects.
 */
export interface IReview {
  _id: Types.ObjectId;

  submissionId: Types.ObjectId;
  reviewerId: Types.ObjectId;
  reviewerType: ReviewerType;

  status: ReviewDecision;
  comments?: string;

  /**
   * The administrator who entered this verdict on the reviewer's behalf.
   *
   * Unset when the reviewer filed it themselves, which is the normal case.
   * The verdict still belongs to `reviewerId` — that is who the student sees
   * and who is accountable for it — but a record of words attributed to
   * somebody who did not type them is only defensible if it also says who did.
   */
  recordedById?: Types.ObjectId | null;

  /** The administrator who last corrected this verdict, if anybody has. */
  editedById?: Types.ObjectId | null;
  editedAt?: Date | null;

  reviewedAt: Date;

  createdAt: Date;
  updatedAt: Date;
}

const reviewSchema = new Schema<IReview>(
  {
    submissionId: { type: Schema.Types.ObjectId, ref: 'VentureSubmission', required: true },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewerType: { type: String, required: true, enum: REVIEWER_TYPES },

    status: { type: String, required: true, enum: REVIEW_DECISIONS },
    comments: { type: String, trim: true },

    recordedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    editedById: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    editedAt: { type: Date, default: null },

    reviewedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true, collection: 'reviews' },
);

// One verdict per reviewer type per submission — a second faculty review of the
// same attempt is a conflict, not an update.
reviewSchema.index({ submissionId: 1, reviewerType: 1 }, { unique: true });
reviewSchema.index({ reviewerId: 1, reviewedAt: -1 });
reviewSchema.index({ reviewerType: 1, status: 1 });

export const Review: Model<IReview> = registerModel<IReview>('Review', reviewSchema);
