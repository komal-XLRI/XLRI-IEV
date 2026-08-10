import type { ReviewerType } from '@/lib/constants/status';
import type { Role } from '@/lib/constants/roles';
import { sameId, type Id } from '@/lib/utils/ids';

/**
 * A reviewer's role determines which review they may create, and nothing else.
 * Faculty can never file a Mentor review, and vice versa.
 */
export function reviewerTypeForRole(role: Role): ReviewerType | null {
  if (role === 'FACULTY') return 'FACULTY';
  if (role === 'MENTOR') return 'MENTOR';
  return null;
}

export interface VentureAssignment {
  facultyId?: Id | null;
  mentorId?: Id | null;
}

/**
 * Assignment check. The reviewer must be the person currently assigned to
 * *this* venture — being faculty somewhere in the programme is not enough.
 */
export function isAssignedReviewer(
  assignment: VentureAssignment,
  reviewerId: Id,
  reviewerType: ReviewerType,
): boolean {
  if (reviewerType === 'FACULTY') return sameId(assignment.facultyId, reviewerId);
  return sameId(assignment.mentorId, reviewerId);
}

export function canReview(
  role: Role,
  assignment: VentureAssignment,
  reviewerId: Id,
): { allowed: boolean; reviewerType: ReviewerType | null; reason?: string } {
  const reviewerType = reviewerTypeForRole(role);

  if (!reviewerType) {
    return { allowed: false, reviewerType: null, reason: 'Only Faculty and Mentors can review.' };
  }

  if (!isAssignedReviewer(assignment, reviewerId, reviewerType)) {
    return {
      allowed: false,
      reviewerType,
      reason: 'You are not the assigned reviewer for this venture.',
    };
  }

  return { allowed: true, reviewerType };
}

/** Students may only ever read their own venture data. */
export function ownsVenture(venture: { studentId: Id }, userId: Id): boolean {
  return sameId(venture.studentId, userId);
}
