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

/** Statuses a received presentation moves a record out of. */
const BEFORE_PRESENTATION: ReadonlySet<StudentActivityStatus> = new Set([
  'NOT_STARTED',
  'IN_PROGRESS',
]);

/**
 * The status a record takes when its presentation is marked received. Records
 * further along — completed, or mid-review under the retired submission flow —
 * keep the status they have.
 */
export function statusOnPresentationReceived(status: StudentActivityStatus): StudentActivityStatus {
  return BEFORE_PRESENTATION.has(status) ? 'PRESENTATION_RECEIVED' : status;
}

/** The status a record returns to when a received mark is withdrawn. */
export function statusOnPresentationCleared(status: StudentActivityStatus): StudentActivityStatus {
  return status === 'PRESENTATION_RECEIVED' ? 'NOT_STARTED' : status;
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
