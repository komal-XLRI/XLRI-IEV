import { describe, expect, it } from 'vitest';
import { createSubmissionSchema, createReviewSchema } from '@/validators/submissions';
import { createVentureActivitySchema } from '@/validators/ventures';
import { verifyOtpSchema } from '@/validators/auth';

const id = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('submission input', () => {
  it('accepts a valid submission', () => {
    const result = createSubmissionSchema.safeParse({
      studentVentureActivityId: id,
      content: 'I interviewed 12 customers.',
    });
    expect(result.success).toBe(true);
  });

  it('has no attemptNumber field — the server computes it', () => {
    const result = createSubmissionSchema.parse({
      studentVentureActivityId: id,
      content: 'x',
    });
    expect(result).not.toHaveProperty('attemptNumber');
  });

  it('silently drops a client-supplied attemptNumber', () => {
    const result = createSubmissionSchema.parse({
      studentVentureActivityId: id,
      content: 'x',
      attemptNumber: 99,
    } as Record<string, unknown>);
    expect(result).not.toHaveProperty('attemptNumber');
  });
});

describe('review input', () => {
  it('accepts each allowed decision', () => {
    for (const status of ['APPROVED', 'REVISION_REQUIRED', 'REJECTED']) {
      expect(createReviewSchema.safeParse({ submissionId: id, status }).success).toBe(true);
    }
  });

  it('rejects PENDING as a submitted decision', () => {
    expect(createReviewSchema.safeParse({ submissionId: id, status: 'PENDING' }).success).toBe(
      false,
    );
  });

  it('has no reviewerType field — it comes from the caller role', () => {
    const result = createReviewSchema.parse({
      submissionId: id,
      status: 'APPROVED',
      reviewerType: 'FACULTY',
    } as Record<string, unknown>);
    expect(result).not.toHaveProperty('reviewerType');
  });
});

describe('venture activity input', () => {
  const base = {
    activityCode: 'V13',
    name: 'Extra activity',
    termId: id,
    order: 13,
    startDate: '2026-11-09',
    endDate: '2026-11-27',
    maxAttempts: 3,
  };

  it('accepts a valid activity', () => {
    expect(createVentureActivitySchema.safeParse(base).success).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    const result = createVentureActivitySchema.safeParse({
      ...base,
      startDate: '2026-11-27',
      endDate: '2026-11-09',
    });
    expect(result.success).toBe(false);
  });

  it('allows a duration outside the 12–15 day guideline', () => {
    expect(createVentureActivitySchema.safeParse({ ...base, endDate: '2026-12-31' }).success).toBe(
      true,
    );
    expect(createVentureActivitySchema.safeParse({ ...base, endDate: '2026-11-10' }).success).toBe(
      true,
    );
  });

  it('rejects a maxAttempts below 1', () => {
    expect(createVentureActivitySchema.safeParse({ ...base, maxAttempts: 0 }).success).toBe(false);
  });

  it('has no durationDays field — it is derived from the dates', () => {
    const result = createVentureActivitySchema.parse(base);
    expect(result).not.toHaveProperty('durationDays');
  });
});

describe('OTP verification input', () => {
  it('accepts a six-digit code', () => {
    expect(verifyOtpSchema.safeParse({ email: 'a@b.com', otp: '123456' }).success).toBe(true);
  });

  it('rejects a short or non-numeric code', () => {
    expect(verifyOtpSchema.safeParse({ email: 'a@b.com', otp: '12345' }).success).toBe(false);
    expect(verifyOtpSchema.safeParse({ email: 'a@b.com', otp: 'abcdef' }).success).toBe(false);
  });

  it('normalises the email to lowercase', () => {
    const result = verifyOtpSchema.parse({ email: 'A@B.COM', otp: '123456' });
    expect(result.email).toBe('a@b.com');
  });
});
