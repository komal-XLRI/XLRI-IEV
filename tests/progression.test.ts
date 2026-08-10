import { describe, expect, it } from 'vitest';
import {
  completionPercentage,
  computeProgression,
  currentActivityOrder,
  isUnlocked,
} from '@/lib/rules/progression';
import type { StudentActivityStatus } from '@/lib/constants/status';

function entries(...statuses: StudentActivityStatus[]) {
  return statuses.map((status, index) => ({ order: index + 1, status }));
}

describe('sequential progression', () => {
  it('unlocks the first activity for a brand new venture', () => {
    const result = computeProgression(entries('NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED'));
    expect(result[0]!.unlocked).toBe(true);
    expect(result[0]!.uiState).toBe('NOT_STARTED');
  });

  it('locks every activity after the first incomplete one', () => {
    const result = computeProgression(entries('NOT_STARTED', 'NOT_STARTED', 'NOT_STARTED'));
    expect(result[1]!.uiState).toBe('LOCKED');
    expect(result[2]!.uiState).toBe('LOCKED');
  });

  it('unlocks V02 once V01 is completed', () => {
    const result = computeProgression(entries('COMPLETED', 'NOT_STARTED', 'NOT_STARTED'));
    expect(result[1]!.unlocked).toBe(true);
    expect(result[2]!.uiState).toBe('LOCKED');
  });

  it('does not unlock the next activity while the current one is under review', () => {
    expect(isUnlocked(entries('COMPLETED', 'UNDER_REVIEW', 'NOT_STARTED'), 3)).toBe(false);
  });

  it('does not unlock the next activity when the current one hit the attempt ceiling', () => {
    // Requires admin intervention rather than silently letting the student past.
    expect(isUnlocked(entries('MAX_ATTEMPTS_REACHED', 'NOT_STARTED'), 2)).toBe(false);
  });

  it('sorts by order rather than trusting input order', () => {
    const shuffled = [
      { order: 3, status: 'NOT_STARTED' as const },
      { order: 1, status: 'COMPLETED' as const },
      { order: 2, status: 'COMPLETED' as const },
    ];
    const result = computeProgression(shuffled);
    expect(result.map((r) => r.entry.order)).toEqual([1, 2, 3]);
    expect(result[2]!.unlocked).toBe(true);
  });
});

describe('current activity', () => {
  it('points at the first unlocked, incomplete activity', () => {
    expect(
      currentActivityOrder(entries('COMPLETED', 'COMPLETED', 'IN_PROGRESS', 'NOT_STARTED')),
    ).toBe(3);
  });

  it('returns null once everything is complete', () => {
    expect(currentActivityOrder(entries('COMPLETED', 'COMPLETED'))).toBeNull();
  });
});

describe('completion percentage', () => {
  it('counts only COMPLETED activities', () => {
    expect(
      completionPercentage(entries('COMPLETED', 'UNDER_REVIEW', 'NOT_STARTED', 'NOT_STARTED')),
    ).toBe(25);
  });

  it('is 0 for an empty venture', () => {
    expect(completionPercentage([])).toBe(0);
  });
});
