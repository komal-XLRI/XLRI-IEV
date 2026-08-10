import { Schema, type Model, type Types } from 'mongoose';
import {
  REVIEW_DECISIONS,
  REVIEWER_TYPES,
  type ReviewDecision,
  type ReviewerType,
} from '@/lib/constants/status';
import { registerModel } from './registerModel';

/**
 * Immutable review history. A fully reviewed submission has exactly two
 * entries — one FACULTY, one MENTOR. Reviews are never edited or deleted;
 * a changed verdict is expressed by a new submission attempt.
 */
export interface IReview {
  _id: Types.ObjectId;

  submissionId: Types.ObjectId;
  reviewerId: Types.ObjectId;
  reviewerType: ReviewerType;

  status: ReviewDecision;
  comments?: string;

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
