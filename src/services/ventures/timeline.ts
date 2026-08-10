import 'server-only';
import type { VentureActivityProgress } from './studentVentureService';
import type { TimelineRow } from '@/types/progress';

/** Flattens the progress read model into the client-safe timeline shape. */
export function toTimelineRow(entry: VentureActivityProgress): TimelineRow {
  const { activity, record, attempt } = entry;

  return {
    recordId: entry.recordId,
    activityId: activity._id.toString(),
    activityCode: activity.activityCode,
    name: activity.name,
    description: activity.description ?? '',
    order: activity.order,
    startDate: activity.startDate.toISOString(),
    endDate: activity.endDate.toISOString(),
    durationDays: activity.durationDays,
    maxAttempts: activity.maxAttempts,
    evidenceRequired: activity.evidenceRequired,

    status: record.status,
    uiState: entry.uiState,
    unlocked: entry.unlocked,

    facultyReviewStatus: record.facultyReviewStatus,
    mentorReviewStatus: record.mentorReviewStatus,
    reviewSummary: entry.reviewSummary,

    attemptsUsed: attempt.attemptsUsed,
    attemptsRemaining: attempt.attemptsRemaining,
    nextAttemptNumber: attempt.nextAttemptNumber,
    submissionType: attempt.submissionType,
    canSubmit: attempt.canSubmit,
    blockedReason: attempt.reason,

    currentSubmissionId: record.currentSubmissionId?.toString() ?? null,
    completedAt: record.completedAt?.toISOString() ?? null,
  };
}

export function toTimeline(entries: VentureActivityProgress[]): TimelineRow[] {
  return entries.map(toTimelineRow);
}
