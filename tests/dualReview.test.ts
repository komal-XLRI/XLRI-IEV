import { describe, expect, it } from 'vitest';
import {
  describeReviewProgress,
  isFullyApproved,
  resolveActivityStatus,
} from '@/lib/rules/dualReview';

const base = { attemptsUsed: 1, maxAttempts: 3 };

describe('mandatory dual review', () => {
  it('does not complete on faculty approval alone', () => {
    expect(
      resolveActivityStatus({
        ...base,
        facultyReviewStatus: 'APPROVED',
        mentorReviewStatus: 'PENDING',
      }),
    ).toBe('UNDER_REVIEW');
  });

  it('does not complete on mentor approval alone', () => {
    expect(
      resolveActivityStatus({
        ...base,
        facultyReviewStatus: 'PENDING',
        mentorReviewStatus: 'APPROVED',
      }),
    ).toBe('UNDER_REVIEW');
  });

  it('completes only when both reviewers approve', () => {
    expect(
      resolveActivityStatus({
        ...base,
        facultyReviewStatus: 'APPROVED',
        mentorReviewStatus: 'APPROVED',
      }),
    ).toBe('COMPLETED');
  });

  it('stays under review while neither reviewer has decided', () => {
    expect(
      resolveActivityStatus({
        ...base,
        facultyReviewStatus: 'PENDING',
        mentorReviewStatus: 'PENDING',
      }),
    ).toBe('UNDER_REVIEW');
  });

  it('is NOT_STARTED before any submission exists', () => {
    expect(
      resolveActivityStatus({
        attemptsUsed: 0,
        maxAttempts: 3,
        facultyReviewStatus: 'PENDING',
        mentorReviewStatus: 'PENDING',
      }),
    ).toBe('NOT_STARTED');
  });
});

describe('revision and rejection', () => {
  it('requires revision when the faculty asks for it, even if the mentor approved', () => {
    expect(
      resolveActivityStatus({
        ...base,
        facultyReviewStatus: 'REVISION_REQUIRED',
        mentorReviewStatus: 'APPROVED',
      }),
    ).toBe('REVISION_REQUIRED');
  });

  it('requires revision when the mentor asks for it, even if the faculty approved', () => {
    expect(
      resolveActivityStatus({
        ...base,
        facultyReviewStatus: 'APPROVED',
        mentorReviewStatus: 'REVISION_REQUIRED',
      }),
    ).toBe('REVISION_REQUIRED');
  });

  it('treats a rejection as ending the attempt', () => {
    expect(
      resolveActivityStatus({
        ...base,
        facultyReviewStatus: 'REJECTED',
        mentorReviewStatus: 'PENDING',
      }),
    ).toBe('REVISION_REQUIRED');
  });

  it('reaches MAX_ATTEMPTS_REACHED when the final attempt is sent back', () => {
    expect(
      resolveActivityStatus({
        attemptsUsed: 3,
        maxAttempts: 3,
        facultyReviewStatus: 'REVISION_REQUIRED',
        mentorReviewStatus: 'APPROVED',
      }),
    ).toBe('MAX_ATTEMPTS_REACHED');
  });

  it('still completes on the final attempt when both approve', () => {
    expect(
      resolveActivityStatus({
        attemptsUsed: 3,
        maxAttempts: 3,
        facultyReviewStatus: 'APPROVED',
        mentorReviewStatus: 'APPROVED',
      }),
    ).toBe('COMPLETED');
  });
});

describe('helpers', () => {
  it('isFullyApproved requires both', () => {
    expect(isFullyApproved('APPROVED', 'APPROVED')).toBe(true);
    expect(isFullyApproved('APPROVED', 'PENDING')).toBe(false);
    expect(isFullyApproved('PENDING', 'APPROVED')).toBe(false);
  });

  it('describes who the activity is waiting on', () => {
    expect(describeReviewProgress('APPROVED', 'PENDING')).toBe('Awaiting mentor');
    expect(describeReviewProgress('PENDING', 'APPROVED')).toBe('Awaiting faculty');
    expect(describeReviewProgress('PENDING', 'PENDING')).toBe('Awaiting both reviews');
    expect(describeReviewProgress('APPROVED', 'APPROVED')).toBe('Both approved');
    expect(describeReviewProgress('REVISION_REQUIRED', 'PENDING')).toBe(
      'Faculty requested changes',
    );
  });
});
