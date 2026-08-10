import 'server-only';
import { getReviewQueue, type ReviewQueueFilters } from './reviewService';
import type { QueueRow } from '@/components/reviewer/ReviewQueue';
import type { Role } from '@/lib/constants/roles';

/** Flattens the review queue into the client-safe table shape. */
export async function getReviewQueueRows(
  reviewer: { userId: string; role: Role },
  filters: ReviewQueueFilters = {},
): Promise<QueueRow[]> {
  const queue = await getReviewQueue(reviewer, filters);

  return queue.map((item) => ({
    recordId: item.record._id.toString(),
    submissionId: item.record.currentSubmissionId?.toString() ?? null,
    studentName: item.venture.studentId?.name ?? 'Unknown',
    studentEmail: item.venture.studentId?.email ?? '',
    ventureName: item.venture.ventureName,
    activityCode: item.activity.activityCode,
    activityName: item.activity.name,
    attemptNumber: item.record.attemptNumber,
    maxAttempts: item.activity.maxAttempts,
    myReviewStatus: item.myReviewStatus,
    otherReviewStatus: item.otherReviewStatus,
    updatedAt: item.record.updatedAt.toISOString(),
  }));
}
