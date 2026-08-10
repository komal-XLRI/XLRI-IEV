import type {
  ReviewStatus,
  StudentActivityStatus,
  SubmissionType,
  UiActivityState,
} from '@/lib/constants/status';

/**
 * Client-safe shape of one row in a venture's activity timeline.
 * Produced by `toTimelineRow` so every screen renders the same derived state.
 */
export interface TimelineRow {
  recordId: string;
  activityId: string;
  activityCode: string;
  name: string;
  description: string;
  order: number;
  startDate: string;
  endDate: string;
  durationDays: number;
  maxAttempts: number;
  evidenceRequired: boolean;

  status: StudentActivityStatus;
  uiState: UiActivityState;
  unlocked: boolean;

  facultyReviewStatus: ReviewStatus;
  mentorReviewStatus: ReviewStatus;
  reviewSummary: string;

  attemptsUsed: number;
  attemptsRemaining: number;
  nextAttemptNumber: number;
  submissionType: SubmissionType;
  canSubmit: boolean;
  blockedReason?: string;

  currentSubmissionId: string | null;
  completedAt: string | null;
}
