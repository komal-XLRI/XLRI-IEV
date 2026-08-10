import { describe, expect, it } from 'vitest';
import {
  canReview,
  isAssignedReviewer,
  ownsVenture,
  reviewerTypeForRole,
} from '@/lib/permissions/reviewAccess';

const FACULTY = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const MENTOR = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const OUTSIDER = 'cccccccccccccccccccccccc';
const STUDENT = 'dddddddddddddddddddddddd';

const assignment = { facultyId: FACULTY, mentorId: MENTOR };

describe('reviewer type is derived from role', () => {
  it('maps faculty and mentor', () => {
    expect(reviewerTypeForRole('FACULTY')).toBe('FACULTY');
    expect(reviewerTypeForRole('MENTOR')).toBe('MENTOR');
  });

  it('gives admins and students no reviewer type', () => {
    expect(reviewerTypeForRole('ADMIN')).toBeNull();
    expect(reviewerTypeForRole('STUDENT')).toBeNull();
  });
});

describe('assignment check', () => {
  it('accepts the assigned faculty', () => {
    expect(isAssignedReviewer(assignment, FACULTY, 'FACULTY')).toBe(true);
  });

  it('accepts the assigned mentor', () => {
    expect(isAssignedReviewer(assignment, MENTOR, 'MENTOR')).toBe(true);
  });

  it('rejects an unassigned faculty member', () => {
    expect(isAssignedReviewer(assignment, OUTSIDER, 'FACULTY')).toBe(false);
  });

  it('rejects the faculty attempting a mentor review', () => {
    expect(isAssignedReviewer(assignment, FACULTY, 'MENTOR')).toBe(false);
  });

  it('rejects the mentor attempting a faculty review', () => {
    expect(isAssignedReviewer(assignment, MENTOR, 'FACULTY')).toBe(false);
  });

  it('rejects everyone when no reviewer is assigned', () => {
    expect(isAssignedReviewer({ facultyId: null, mentorId: null }, FACULTY, 'FACULTY')).toBe(false);
  });
});

describe('canReview', () => {
  it('lets the assigned faculty file a faculty review', () => {
    const result = canReview('FACULTY', assignment, FACULTY);
    expect(result.allowed).toBe(true);
    expect(result.reviewerType).toBe('FACULTY');
  });

  it('refuses an unassigned reviewer', () => {
    const result = canReview('FACULTY', assignment, OUTSIDER);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('not the assigned reviewer');
  });

  it('refuses a student outright', () => {
    const result = canReview('STUDENT', assignment, STUDENT);
    expect(result.allowed).toBe(false);
    expect(result.reviewerType).toBeNull();
  });

  it('refuses an admin — admins manage assignment, they do not review', () => {
    expect(canReview('ADMIN', assignment, OUTSIDER).allowed).toBe(false);
  });
});

describe('venture ownership', () => {
  it('accepts the owning student', () => {
    expect(ownsVenture({ studentId: STUDENT }, STUDENT)).toBe(true);
  });

  it('rejects another student', () => {
    expect(ownsVenture({ studentId: STUDENT }, OUTSIDER)).toBe(false);
  });
});
