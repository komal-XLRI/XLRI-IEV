import { describe, expect, it } from 'vitest';
import { attemptsRemaining, evaluateAttempt, nextSubmissionType } from '@/lib/rules/attempts';

const unlocked = { unlocked: true, maxAttempts: 3 } as const;

describe('attempt limit with maxAttempts = 3', () => {
  it('allows attempt 1', () => {
    const decision = evaluateAttempt({ ...unlocked, attemptsUsed: 0, status: 'NOT_STARTED' });
    expect(decision.canSubmit).toBe(true);
    expect(decision.nextAttemptNumber).toBe(1);
  });

  it('allows attempt 2 after a revision request', () => {
    const decision = evaluateAttempt({
      ...unlocked,
      attemptsUsed: 1,
      status: 'REVISION_REQUIRED',
    });
    expect(decision.canSubmit).toBe(true);
    expect(decision.nextAttemptNumber).toBe(2);
  });

  it('allows attempt 3 after a second revision request', () => {
    const decision = evaluateAttempt({
      ...unlocked,
      attemptsUsed: 2,
      status: 'REVISION_REQUIRED',
    });
    expect(decision.canSubmit).toBe(true);
    expect(decision.nextAttemptNumber).toBe(3);
  });

  it('blocks attempt 4', () => {
    const decision = evaluateAttempt({
      ...unlocked,
      attemptsUsed: 3,
      status: 'REVISION_REQUIRED',
    });
    expect(decision.canSubmit).toBe(false);
    expect(decision.attemptsRemaining).toBe(0);
    expect(decision.reason).toContain('all 3 attempts');
  });

  it('blocks once the record is MAX_ATTEMPTS_REACHED', () => {
    const decision = evaluateAttempt({
      ...unlocked,
      attemptsUsed: 3,
      status: 'MAX_ATTEMPTS_REACHED',
    });
    expect(decision.canSubmit).toBe(false);
  });
});

describe('other blocking conditions', () => {
  it('blocks while an attempt is under review', () => {
    const decision = evaluateAttempt({ ...unlocked, attemptsUsed: 1, status: 'UNDER_REVIEW' });
    expect(decision.canSubmit).toBe(false);
    expect(decision.reason).toContain('under review');
  });

  it('blocks a completed activity', () => {
    const decision = evaluateAttempt({ ...unlocked, attemptsUsed: 1, status: 'COMPLETED' });
    expect(decision.canSubmit).toBe(false);
    expect(decision.reason).toContain('already completed');
  });

  it('blocks a locked activity even with attempts left', () => {
    const decision = evaluateAttempt({
      unlocked: false,
      maxAttempts: 3,
      attemptsUsed: 0,
      status: 'NOT_STARTED',
    });
    expect(decision.canSubmit).toBe(false);
    expect(decision.reason).toContain('previous activity');
  });
});

describe('attempt arithmetic', () => {
  it('never reports negative remaining attempts', () => {
    expect(attemptsRemaining(5, 3)).toBe(0);
    expect(attemptsRemaining(0, 3)).toBe(3);
  });

  it('labels the first attempt INITIAL and the last FINAL', () => {
    expect(nextSubmissionType(1, 3)).toBe('INITIAL');
    expect(nextSubmissionType(2, 3)).toBe('REVISION');
    expect(nextSubmissionType(3, 3)).toBe('FINAL');
  });

  it('labels a single-attempt activity INITIAL', () => {
    expect(nextSubmissionType(1, 1)).toBe('INITIAL');
  });
});
