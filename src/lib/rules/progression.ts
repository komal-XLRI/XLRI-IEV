import type { StudentActivityStatus, UiActivityState } from '@/lib/constants/status';

/**
 * Sequential progression.
 *
 * V(n) unlocks only when V(n-1) is COMPLETED — i.e. when both reviewers have
 * approved it. An activity sitting at MAX_ATTEMPTS_REACHED therefore does NOT
 * unlock its successor; that case needs Admin intervention (raising
 * `maxAttempts` on the activity), which is intentional rather than an
 * oversight.
 */
export interface ProgressionEntry {
  /** `order` from the VentureActivity master record. */
  order: number;
  status: StudentActivityStatus;
}

export interface ProgressionResult<T extends ProgressionEntry> {
  entry: T;
  unlocked: boolean;
  uiState: UiActivityState;
}

export function computeProgression<T extends ProgressionEntry>(
  entries: readonly T[],
): ProgressionResult<T>[] {
  const ordered = [...entries].sort((a, b) => a.order - b.order);

  let previousCompleted = true; // the first activity is always available
  return ordered.map((entry) => {
    const unlocked = previousCompleted;
    previousCompleted = entry.status === 'COMPLETED';

    return {
      entry,
      unlocked,
      uiState: unlocked ? entry.status : 'LOCKED',
    };
  });
}

export function isUnlocked<T extends ProgressionEntry>(
  entries: readonly T[],
  order: number,
): boolean {
  return computeProgression(entries).find((r) => r.entry.order === order)?.unlocked ?? false;
}

/**
 * The activity the student should be working on right now: the first that is
 * unlocked and not yet completed. Returns null once every activity is done.
 */
export function currentActivityOrder<T extends ProgressionEntry>(
  entries: readonly T[],
): number | null {
  const progression = computeProgression(entries);
  const current = progression.find((r) => r.unlocked && r.entry.status !== 'COMPLETED');
  return current?.entry.order ?? null;
}

export function completionPercentage<T extends ProgressionEntry>(entries: readonly T[]): number {
  if (entries.length === 0) return 0;
  const completed = entries.filter((e) => e.status === 'COMPLETED').length;
  return Math.round((completed / entries.length) * 100);
}
