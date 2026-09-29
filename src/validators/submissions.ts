import { z } from 'zod';
import { REVIEW_DECISIONS, REVIEWER_TYPES } from '@/lib/constants/status';
import { objectId } from './common';

/** Review decision. `reviewerType` is derived from the caller's role, never sent. */
export const createReviewSchema = z.object({
  submissionId: objectId,
  status: z.enum(REVIEW_DECISIONS),
  comments: z.string().trim().max(4000).optional().or(z.literal('')),
});

/**
 * The same decision, filed by an administrator for a reviewer who is not the
 * one logged in.
 *
 * `reviewerType` has to be stated here, because it cannot be derived from the
 * caller's role the way it is for a reviewer filing their own verdict. Which
 * person that resolves to is decided by the server from the venture's current
 * assignment, never sent by the form.
 */
export const reviewOnBehalfSchema = createReviewSchema.extend({
  reviewerType: z.enum(REVIEWER_TYPES, { message: 'Choose faculty or mentor' }),
});

/**
 * A correction to a verdict already on record.
 *
 * The reviewer it belongs to is not in here and cannot be changed: an edit
 * fixes what was decided, not who decided it. A verdict filed against the
 * wrong reviewer is deleted and filed again.
 */
export const updateReviewSchema = z.object({
  reviewId: objectId,
  status: z.enum(REVIEW_DECISIONS),
  comments: z.string().trim().max(4000).optional().or(z.literal('')),
});

export type UpdateReviewInput = z.infer<typeof updateReviewSchema>;
export type CreateReviewInput = z.infer<typeof createReviewSchema>;
export type ReviewOnBehalfInput = z.infer<typeof reviewOnBehalfSchema>;
