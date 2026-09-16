'use server';

import { revalidatePath } from 'next/cache';
import { requireAdmin } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import { reviewOnBehalfSchema, updateReviewSchema } from '@/validators/submissions';
import { objectId } from '@/validators/common';
import { createReviewOnBehalf, deleteReview, updateReview } from '@/services/reviews/reviewService';
import type { ReviewCreated } from './reviewActions';

/**
 * Review verdicts the programme office files, corrects or removes.
 *
 * Every action re-checks the caller is an administrator: the middleware
 * redirect and the layout's role gate are both conveniences, and neither is on
 * the path a form POST actually takes.
 *
 * Which reviewer a verdict belongs to is never read from the form — the
 * service resolves it from the venture's own assignment, so an administrator
 * cannot file words under a faculty member who has nothing to do with this
 * student.
 */

const REVIEWS_PATH = '/admin/reviews';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

/** Everyone who can see a verdict reads it from their own page. */
function revalidateReviews() {
  revalidatePath(REVIEWS_PATH);
  revalidatePath('/admin');
  revalidatePath('/student');
}

/**
 * Files a review decision for the assigned faculty member or mentor.
 *
 * This moves the student: two approvals complete the activity and unlock the
 * next one. It runs the same rules as a reviewer's own verdict — see
 * `createReviewOnBehalf` — and records which administrator entered it.
 */
export async function fileReviewOnBehalfAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<ReviewCreated>> {
  return runAction(async () => {
    const admin = await requireAdmin();

    const input = reviewOnBehalfSchema.parse({
      submissionId: value(formData, 'submissionId'),
      reviewerType: value(formData, 'reviewerType'),
      status: value(formData, 'status'),
      comments: value(formData, 'comments'),
    });

    const result = await createReviewOnBehalf(input, admin.userId);

    revalidateReviews();
    return result;
  });
}

/**
 * Corrects a verdict already on record.
 *
 * This can move a student backwards — an approval changed to a revision
 * request un-completes the activity — which is the whole reason it exists, and
 * why `updateReview` recomputes the record rather than editing a row in place.
 */
export async function updateReviewAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const admin = await requireAdmin();

    const input = updateReviewSchema.parse({
      reviewId: value(formData, 'reviewId'),
      status: value(formData, 'status'),
      comments: value(formData, 'comments'),
    });

    const result = await updateReview(input, admin.userId);

    revalidateReviews();
    return result;
  });
}

/** Removes a verdict, putting that half of the review back to pending. */
export async function deleteReviewAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<unknown>> {
  return runAction(async () => {
    const admin = await requireAdmin();

    const reviewId = objectId.parse(value(formData, 'reviewId'));
    const result = await deleteReview(reviewId, admin.userId);

    revalidateReviews();
    return result;
  });
}
