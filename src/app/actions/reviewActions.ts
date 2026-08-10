'use server';

import { revalidatePath } from 'next/cache';
import { requireReviewer } from '@/lib/auth/currentUser';
import { runAction, type ActionResult } from '@/lib/actions/actionResult';
import { createReviewSchema } from '@/validators/submissions';
import { createReview } from '@/services/reviews/reviewService';
import type { ReviewStatus, StudentActivityStatus } from '@/lib/constants/status';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (typeof raw !== 'string') return undefined;
  return raw.trim() === '' ? undefined : raw;
}

export interface ReviewCreated {
  reviewId: string;
  reviewerType: 'FACULTY' | 'MENTOR';
  facultyReviewStatus: ReviewStatus;
  mentorReviewStatus: ReviewStatus;
  activityStatus: StudentActivityStatus;
}

/**
 * Files this reviewer's verdict.
 *
 * `reviewerType` is derived from the authenticated role inside the service —
 * a Faculty member cannot post a Mentor review by editing the form, and one
 * approval alone never completes the activity.
 */
export async function submitReviewAction(
  _prev: unknown,
  formData: FormData,
): Promise<ActionResult<ReviewCreated>> {
  return runAction(async () => {
    const reviewer = await requireReviewer();

    const input = createReviewSchema.parse({
      submissionId: value(formData, 'submissionId'),
      status: value(formData, 'status'),
      comments: value(formData, 'comments'),
    });

    const result = await createReview(input, { userId: reviewer.userId, role: reviewer.role });

    const home = reviewer.role === 'FACULTY' ? '/faculty' : '/mentor';
    revalidatePath(home);
    revalidatePath(`${home}/reviews`);
    revalidatePath(`${home}/submissions/${input.submissionId}`);

    return result;
  });
}
