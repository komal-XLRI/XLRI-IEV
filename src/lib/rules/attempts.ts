import type { StudentActivityStatus, SubmissionType } from '@/lib/constants/status';

/**
 * Attempt accounting. Every value here is recomputed on the server from
 * persisted state — `attemptNumber` supplied by a client is always ignored.
 */
export interface AttemptState {
  attemptsUsed: number;
  maxAttempts: number;
  status: StudentActivityStatus;
  /** False when an earlier activity in the sequence is not yet complete. */
  unlocked: boolean;
}

export interface AttemptDecision {
  canSubmit: boolean;
  attemptsUsed: number;
  attemptsRemaining: number;
  nextAttemptNumber: number;
  submissionType: SubmissionType;
  /** Populated only when `canSubmit` is false. */
  reason?: string;
}

/** Statuses from which a student may start or resume work. */
const SUBMITTABLE_STATUSES: ReadonlySet<StudentActivityStatus> = new Set([
  'NOT_STARTED',
  'IN_PROGRESS',
  'REVISION_REQUIRED',
]);

export function attemptsRemaining(attemptsUsed: number, maxAttempts: number): number {
  return Math.max(0, maxAttempts - attemptsUsed);
}

export function nextSubmissionType(nextAttemptNumber: number, maxAttempts: number): SubmissionType {
  if (nextAttemptNumber <= 1) return 'INITIAL';
  if (nextAttemptNumber >= maxAttempts) return 'FINAL';
  return 'REVISION';
}

export function evaluateAttempt(state: AttemptState): AttemptDecision {
  const { attemptsUsed, maxAttempts, status, unlocked } = state;
  const remaining = attemptsRemaining(attemptsUsed, maxAttempts);
  const nextAttemptNumber = attemptsUsed + 1;

  const base = {
    attemptsUsed,
    attemptsRemaining: remaining,
    nextAttemptNumber,
    submissionType: nextSubmissionType(nextAttemptNumber, maxAttempts),
  };

  if (!unlocked) {
    return { ...base, canSubmit: false, reason: 'Complete the previous activity first.' };
  }

  if (status === 'COMPLETED') {
    return { ...base, canSubmit: false, reason: 'This activity is already completed.' };
  }

  if (status === 'UNDER_REVIEW') {
    return {
      ...base,
      canSubmit: false,
      reason: 'Your submission is under review. Wait for both reviews before resubmitting.',
    };
  }

  if (status === 'MAX_ATTEMPTS_REACHED' || remaining <= 0) {
    return {
      ...base,
      canSubmit: false,
      reason: `You have used all ${maxAttempts} attempts for this activity.`,
    };
  }

  if (!SUBMITTABLE_STATUSES.has(status)) {
    return { ...base, canSubmit: false, reason: 'This activity is not open for submission.' };
  }

  return { ...base, canSubmit: true };
}
