import type { ReviewStatus, StudentActivityStatus, UiActivityState } from '@/lib/constants/status';

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

  /** The stage's shared Drive folder, when the administrator has set one. */
  presentationFolderUrl: string | null;
  /** When this student's presentation was confirmed as in the folder. */
  presentationReceivedAt: string | null;

  status: StudentActivityStatus;
  uiState: UiActivityState;
  unlocked: boolean;

  facultyReviewStatus: ReviewStatus;
  mentorReviewStatus: ReviewStatus;
  reviewSummary: string;

  /** Submissions made under the retired in-app submission flow. */
  submissionsMade: number;

  currentSubmissionId: string | null;
  completedAt: string | null;
}
