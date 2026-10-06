import type { StudentActivityStatus } from '@/lib/constants/status';

/**
 * Presentation stage rule.
 *
 * A venture activity is a stage the whole cohort moves through together. Each
 * student presents; the administrator collects every presentation into one
 * Drive folder and ticks each student off. The stage is "presentations
 * complete" once every student is ticked, and COMPLETED only once feedback on
 * those presentations has been given — receiving them is not the end of it.
 */

/**
 * Statuses of the retired submit-and-review flow. Nothing produces them any
 * more; a record still carrying one is read as "not presented yet".
 */
export const RETIRED_REVIEW_STATUSES: ReadonlySet<StudentActivityStatus> = new Set([
  'UNDER_REVIEW',
  'REVISION_REQUIRED',
]);

/**
 * The status a record takes when its presentation is marked received. Only a
 * COMPLETED record keeps its status; everything else — including a leftover
 * status from the retired review flow — becomes PRESENTATION_RECEIVED.
 */
export function statusOnPresentationReceived(status: StudentActivityStatus): StudentActivityStatus {
  return status === 'COMPLETED' ? status : 'PRESENTATION_RECEIVED';
}

/** The status a record returns to when a received mark is withdrawn. */
export function statusOnPresentationCleared(status: StudentActivityStatus): StudentActivityStatus {
  return status === 'PRESENTATION_RECEIVED' || RETIRED_REVIEW_STATUSES.has(status)
    ? 'NOT_STARTED'
    : status;
}

export type PresentationStageState =
  /** Nobody is enrolled on this activity yet. */
  | 'NO_STUDENTS'
  /** Some presentations are still missing from the folder. */
  | 'COLLECTING'
  /** Every presentation is in; the stage now waits on feedback. */
  | 'AWAITING_FEEDBACK'
  /** Every student on the stage has completed it. */
  | 'COMPLETED';

export interface PresentationTally {
  total: number;
  received: number;
  completed: number;
}

export function presentationStageState({
  total,
  received,
  completed,
}: PresentationTally): PresentationStageState {
  if (total === 0) return 'NO_STUDENTS';
  if (completed >= total) return 'COMPLETED';
  if (received >= total) return 'AWAITING_FEEDBACK';
  return 'COLLECTING';
}

export const PRESENTATION_STAGE_LABELS: Record<PresentationStageState, string> = {
  NO_STUDENTS: 'No students yet',
  COLLECTING: 'Collecting presentations',
  AWAITING_FEEDBACK: 'All presentations in — awaiting feedback',
  COMPLETED: 'Stage completed',
};
