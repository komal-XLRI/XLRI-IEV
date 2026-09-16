import { describe, expect, it } from 'vitest';
import { reviewOnBehalfSchema, updateReviewSchema } from '@/validators/submissions';

/**
 * What the administrator's review forms will and will not accept.
 *
 * The rule worth a test is what is *absent* from both schemas: neither lets
 * the caller name the reviewer the verdict belongs to. That is resolved
 * server-side from the venture's own assignment, and a schema that quietly
 * accepted a `reviewerId` would be the way round it.
 */

const SUBMISSION_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const REVIEW_ID = 'dddddddddddddddddddddddd';
const OTHER_ID = 'cccccccccccccccccccccccc';

describe('a review filed on a reviewer behalf', () => {
  it('needs the reviewer type stated, since no role implies it', () => {
    expect(
      reviewOnBehalfSchema.safeParse({ submissionId: SUBMISSION_ID, status: 'APPROVED' }).success,
    ).toBe(false);

    expect(
      reviewOnBehalfSchema.safeParse({
        submissionId: SUBMISSION_ID,
        reviewerType: 'FACULTY',
        status: 'APPROVED',
      }).success,
    ).toBe(true);
  });

  it('takes the same decisions a reviewer can give, and no others', () => {
    for (const status of ['APPROVED', 'REVISION_REQUIRED', 'REJECTED']) {
      expect(
        reviewOnBehalfSchema.safeParse({
          submissionId: SUBMISSION_ID,
          reviewerType: 'MENTOR',
          status,
        }).success,
      ).toBe(true);
    }

    expect(
      reviewOnBehalfSchema.safeParse({
        submissionId: SUBMISSION_ID,
        reviewerType: 'MENTOR',
        status: 'PENDING',
      }).success,
    ).toBe(false);
  });

  it('will not let the form choose which reviewer it is filed for', () => {
    const result = reviewOnBehalfSchema.safeParse({
      submissionId: SUBMISSION_ID,
      reviewerType: 'FACULTY',
      status: 'APPROVED',
      reviewerId: OTHER_ID,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect('reviewerId' in result.data).toBe(false);
  });
});

describe('administrator corrections', () => {
  it('lets a verdict be rewritten, but not reassigned to another reviewer', () => {
    const result = updateReviewSchema.safeParse({
      reviewId: REVIEW_ID,
      status: 'REVISION_REQUIRED',
      comments: 'Filed against the wrong decision.',
      reviewerId: OTHER_ID,
      reviewerType: 'MENTOR',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect('reviewerId' in result.data).toBe(false);
    expect('reviewerType' in result.data).toBe(false);
  });

  it('refuses a correction with no decision on it', () => {
    expect(updateReviewSchema.safeParse({ reviewId: REVIEW_ID }).success).toBe(false);
    expect(updateReviewSchema.safeParse({ reviewId: REVIEW_ID, status: 'PENDING' }).success).toBe(
      false,
    );
  });

  it('refuses an id that is not an id', () => {
    expect(
      updateReviewSchema.safeParse({ reviewId: 'the-last-one', status: 'APPROVED' }).success,
    ).toBe(false);
  });
});
