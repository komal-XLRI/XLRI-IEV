import type { ReviewStatus, StudentActivityStatus } from '@/lib/constants/status';

/**
 * Mandatory dual review.
 *
 * A Venture Activity is COMPLETED only when BOTH the Faculty and the Mentor
 * have approved. One approval alone never completes an activity, and never
 * advances the venture.
 */
export interface DualReviewInput {
  facultyReviewStatus: ReviewStatus;
  mentorReviewStatus: ReviewStatus;
  /** Submissions made so far. */
  attemptsUsed: number;
  maxAttempts: number;
}

/** A verdict that sends the work back — the attempt has failed. */
function isNegative(status: ReviewStatus): boolean {
  return status === 'REVISION_REQUIRED' || status === 'REJECTED';
}

export function resolveActivityStatus(input: DualReviewInput): StudentActivityStatus {
  const { facultyReviewStatus, mentorReviewStatus, attemptsUsed, maxAttempts } = input;

  // A negative verdict from either reviewer ends the attempt immediately —
  // there is no point waiting for the second reviewer to agree.
  if (isNegative(facultyReviewStatus) || isNegative(mentorReviewStatus)) {
    return attemptsUsed >= maxAttempts ? 'MAX_ATTEMPTS_REACHED' : 'REVISION_REQUIRED';
  }

  if (facultyReviewStatus === 'APPROVED' && mentorReviewStatus === 'APPROVED') {
    return 'COMPLETED';
  }

  // At least one reviewer is still PENDING, and nobody has objected.
  if (facultyReviewStatus === 'APPROVED' || mentorReviewStatus === 'APPROVED') {
    return 'UNDER_REVIEW';
  }

  return attemptsUsed > 0 ? 'UNDER_REVIEW' : 'NOT_STARTED';
}

export function isFullyApproved(
  facultyReviewStatus: ReviewStatus,
  mentorReviewStatus: ReviewStatus,
): boolean {
  return facultyReviewStatus === 'APPROVED' && mentorReviewStatus === 'APPROVED';
}

/** Human-readable summary for review dashboards. */
export function describeReviewProgress(
  facultyReviewStatus: ReviewStatus,
  mentorReviewStatus: ReviewStatus,
): string {
  if (isFullyApproved(facultyReviewStatus, mentorReviewStatus)) return 'Both approved';
  if (isNegative(facultyReviewStatus) && isNegative(mentorReviewStatus))
    return 'Both requested changes';
  if (isNegative(facultyReviewStatus)) return 'Faculty requested changes';
  if (isNegative(mentorReviewStatus)) return 'Mentor requested changes';
  if (facultyReviewStatus === 'APPROVED') return 'Awaiting mentor';
  if (mentorReviewStatus === 'APPROVED') return 'Awaiting faculty';
  return 'Awaiting both reviews';
}
