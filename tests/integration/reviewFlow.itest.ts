/**
 * End-to-end exercise of the rules the spec calls out, against a real
 * MongoDB, through the actual service layer.
 *
 * Requires MONGODB_URI. Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'integration-test-secret-at-least-32-characters';

const { connectToDatabase, disconnectFromDatabase } = await import('@/lib/db/mongoose');
const models = await import('@/models');
const { createUser } = await import('@/services/users/userService');
const { createStudentVenture, getVentureProgress } =
  await import('@/services/ventures/studentVentureService');
const { createSubmission } = await import('@/services/submissions/submissionService');
const { createReview } = await import('@/services/reviews/reviewService');
const { getPendingReviewAttempts } = await import('@/services/dashboard/dashboardService');

const SUFFIX = `itest-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

let studentId: string;
let facultyId: string;
let mentorId: string;
let otherFacultyId: string;
let ventureId: string;
let firstActivityRecordId: string;
let secondActivityRecordId: string;

/** Read from the seeded activities rather than assumed — the admin can change it. */
let maxAttempts: number;

beforeAll(async () => {
  await connectToDatabase();

  const activityCount = await models.VentureActivity.countDocuments({ status: 'ACTIVE' }).exec();
  if (activityCount < 2) {
    throw new Error('Run `npm run seed` before the integration tests.');
  }

  studentId = (
    await createUser({
      role: 'STUDENT',
      name: 'Integration Student',
      email: email('student'),
      status: 'ACTIVE',
      profile: { rollNumber: `ROLL-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  facultyId = (
    await createUser({
      role: 'FACULTY',
      name: 'Integration Faculty',
      email: email('faculty'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  otherFacultyId = (
    await createUser({
      role: 'FACULTY',
      name: 'Unassigned Faculty',
      email: email('other-faculty'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  mentorId = (
    await createUser({
      role: 'MENTOR',
      name: 'Integration Mentor',
      email: email('mentor'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  ventureId = (
    await createStudentVenture({
      studentId,
      ventureName: 'Integration Venture',
      facultyId,
      mentorId,
      status: 'ACTIVE',
    })
  ).studentVentureId;

  // getVentureProgress returns rows sorted by activity order, so these are the
  // first two activities of the programme — the only ones initially unlocked.
  const progress = await getVentureProgress(ventureId);
  firstActivityRecordId = progress[0]!.recordId;
  secondActivityRecordId = progress[1]!.recordId;
  maxAttempts = progress[1]!.activity.maxAttempts;
});

/**
 * Stages one evidence file against a record, the way a completed upload does.
 *
 * The seeded activities all require evidence, and `createSubmission` now
 * refuses an attempt that has none — so a test about reviews still has to
 * satisfy the rule that guards submission.
 */
async function stageEvidence(studentVentureActivityId: string) {
  await models.Evidence.create({
    submissionId: null,
    studentVentureActivityId,
    fileName: 'evidence.pdf',
    fileUrl: `https://res.cloudinary.com/demo/raw/upload/${SUFFIX}/evidence.pdf`,
    publicId: `iev-tracker/evidence/${studentVentureActivityId}/${SUFFIX}-${Date.now()}`,
    fileType: 'application/pdf',
    resourceType: 'raw',
    fileSize: 1024,
    uploadedBy: studentId,
    uploadedAt: new Date(),
  });
}

afterAll(async () => {
  // Leave the seeded reference data alone; remove only this run's fixtures.
  const userIds = [studentId, facultyId, mentorId, otherFacultyId].filter(Boolean);
  const records = await models.StudentVentureActivity.find({ studentVentureId: ventureId })
    .select('_id')
    .lean()
    .exec();
  const submissions = await models.VentureSubmission.find({
    studentVentureActivityId: { $in: records.map((r) => r._id) },
  })
    .select('_id')
    .lean()
    .exec();

  await models.Evidence.deleteMany({
    studentVentureActivityId: { $in: records.map((r) => r._id) },
  }).exec();
  await models.Review.deleteMany({ submissionId: { $in: submissions.map((s) => s._id) } }).exec();
  await models.VentureSubmission.deleteMany({
    studentVentureActivityId: { $in: records.map((r) => r._id) },
  }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: ventureId }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: ventureId }).exec();
  await models.StudentVenture.deleteOne({ _id: ventureId }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.FacultyProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.MentorProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

describe('venture bootstrap', () => {
  it('creates a progress record for every active venture activity', async () => {
    const progress = await getVentureProgress(ventureId);
    const activities = await models.VentureActivity.countDocuments({ status: 'ACTIVE' }).exec();
    expect(progress).toHaveLength(activities);
  });

  it('creates support activity records too', async () => {
    const count = await models.StudentSupportActivity.countDocuments({
      studentVentureId: ventureId,
    }).exec();
    expect(count).toBe(8);
  });
});

describe('dual review over a real submission', () => {
  let submissionId: string;

  it('accepts the first submission and computes attempt 1', async () => {
    await stageEvidence(firstActivityRecordId);
    const result = await createSubmission(
      { studentVentureActivityId: firstActivityRecordId, content: 'Attempt one' },
      studentId,
    );

    expect(result.attemptNumber).toBe(1);
    expect(result.submissionType).toBe('INITIAL');
    submissionId = result.submissionId;
  });

  it('refuses a second submission while the first is under review', async () => {
    await expect(
      createSubmission(
        { studentVentureActivityId: firstActivityRecordId, content: 'Premature' },
        studentId,
      ),
    ).rejects.toThrow(/under review/i);
  });

  it('refuses a submission from a different student', async () => {
    await expect(
      createSubmission(
        { studentVentureActivityId: firstActivityRecordId, content: 'Not mine' },
        facultyId,
      ),
    ).rejects.toThrow(/does not belong to you/i);
  });

  it('refuses a review from an unassigned faculty member', async () => {
    await expect(
      createReview(
        { submissionId, status: 'APPROVED' },
        { userId: otherFacultyId, role: 'FACULTY' },
      ),
    ).rejects.toThrow(/not the assigned reviewer/i);
  });

  it('refuses a review from the student', async () => {
    await expect(
      createReview({ submissionId, status: 'APPROVED' }, { userId: studentId, role: 'STUDENT' }),
    ).rejects.toThrow(/only faculty and mentors/i);
  });

  it('does NOT complete the activity on faculty approval alone', async () => {
    const result = await createReview(
      { submissionId, status: 'APPROVED', comments: 'Good work' },
      { userId: facultyId, role: 'FACULTY' },
    );

    expect(result.reviewerType).toBe('FACULTY');
    expect(result.activityStatus).toBe('UNDER_REVIEW');

    const record = await models.StudentVentureActivity.findById(firstActivityRecordId)
      .lean()
      .exec();
    expect(record!.status).toBe('UNDER_REVIEW');
    expect(record!.completedAt).toBeNull();
  });

  // Runs here because it needs a record that is genuinely under review: the
  // admin queue populates through the venture to reach the student, and an
  // empty result set would not exercise that path at all.
  it('surfaces the attempt in the admin pending-review queue, with names resolved', async () => {
    const pending = await getPendingReviewAttempts(100);
    const row = pending.find((entry) => entry.recordId === firstActivityRecordId);

    expect(row).toBeDefined();
    expect(row!.studentName).toBe('Integration Student');
    expect(row!.ventureName).toBe('Integration Venture');
    expect(row!.activityCode).toBeTruthy();
  });

  it('refuses a second faculty review of the same attempt', async () => {
    await expect(
      createReview({ submissionId, status: 'REJECTED' }, { userId: facultyId, role: 'FACULTY' }),
    ).rejects.toThrow(/already exists/i);
  });

  it('completes the activity once the mentor also approves', async () => {
    const result = await createReview(
      { submissionId, status: 'APPROVED', comments: 'Agreed' },
      { userId: mentorId, role: 'MENTOR' },
    );

    expect(result.reviewerType).toBe('MENTOR');
    expect(result.activityStatus).toBe('COMPLETED');

    const record = await models.StudentVentureActivity.findById(firstActivityRecordId)
      .lean()
      .exec();
    expect(record!.status).toBe('COMPLETED');
    expect(record!.completedAt).not.toBeNull();
  });

  it('keeps both reviews in history', async () => {
    const reviews = await models.Review.find({ submissionId }).lean().exec();
    expect(reviews).toHaveLength(2);
    expect(reviews.map((r) => r.reviewerType).sort()).toEqual(['FACULTY', 'MENTOR']);
  });

  it('advances the venture pointer only after both approvals', async () => {
    const venture = await models.StudentVenture.findById(ventureId).lean().exec();
    const record = await models.StudentVentureActivity.findById(secondActivityRecordId)
      .lean()
      .exec();
    expect(venture!.currentVentureActivityId?.toString()).toBe(
      record!.ventureActivityId.toString(),
    );
  });
});

describe('progression lock', () => {
  it('unlocks the next activity once the previous one is completed', async () => {
    const progress = await getVentureProgress(ventureId);
    const second = progress.find((p) => p.recordId === secondActivityRecordId)!;
    expect(second.unlocked).toBe(true);
    expect(second.uiState).toBe('NOT_STARTED');
  });

  it('keeps later activities locked', async () => {
    const progress = await getVentureProgress(ventureId);
    const locked = progress.filter((p) => p.uiState === 'LOCKED');
    expect(locked.length).toBeGreaterThan(0);
  });

  it('refuses a submission for a locked activity', async () => {
    const progress = await getVentureProgress(ventureId);
    const locked = progress.find((p) => p.uiState === 'LOCKED');

    await expect(
      createSubmission(
        { studentVentureActivityId: locked!.recordId, content: 'Skipping ahead' },
        studentId,
      ),
    ).rejects.toThrow(/previous activity/i);
  });
});

describe('attempt limit is enforced server-side', () => {
  async function submitAndSendBack(expectedAttempt: number) {
    await stageEvidence(secondActivityRecordId);
    const submission = await createSubmission(
      { studentVentureActivityId: secondActivityRecordId, content: `Attempt ${expectedAttempt}` },
      studentId,
    );
    expect(submission.attemptNumber).toBe(expectedAttempt);

    await createReview(
      { submissionId: submission.submissionId, status: 'REVISION_REQUIRED', comments: 'Redo' },
      { userId: facultyId, role: 'FACULTY' },
    );

    return submission;
  }

  it('allows exactly maxAttempts submissions, the last labelled FINAL', async () => {
    for (let attempt = 1; attempt < maxAttempts; attempt += 1) {
      await submitAndSendBack(attempt);
    }
    const last = await submitAndSendBack(maxAttempts);
    expect(last.submissionType).toBe('FINAL');
  });

  it('marks the record MAX_ATTEMPTS_REACHED after the final attempt fails', async () => {
    const record = await models.StudentVentureActivity.findById(secondActivityRecordId)
      .lean()
      .exec();
    expect(record!.attemptNumber).toBe(maxAttempts);
    expect(record!.status).toBe('MAX_ATTEMPTS_REACHED');
  });

  it('blocks the attempt after the limit', async () => {
    await expect(
      createSubmission(
        { studentVentureActivityId: secondActivityRecordId, content: 'One too many' },
        studentId,
      ),
    ).rejects.toThrow(new RegExp(`all ${maxAttempts} attempts`, 'i'));
  });

  it('preserved every earlier submission rather than overwriting', async () => {
    const submissions = await models.VentureSubmission.find({
      studentVentureActivityId: secondActivityRecordId,
    })
      .sort({ attemptNumber: 1 })
      .lean()
      .exec();

    const expected = Array.from({ length: maxAttempts }, (_, i) => i + 1);
    expect(submissions.map((s) => s.attemptNumber)).toEqual(expected);
    expect(submissions.map((s) => s.content)).toEqual(expected.map((n) => `Attempt ${n}`));
  });

  it('preserved a review for every attempt', async () => {
    const submissions = await models.VentureSubmission.find({
      studentVentureActivityId: secondActivityRecordId,
    })
      .select('_id')
      .lean()
      .exec();

    const reviews = await models.Review.find({
      submissionId: { $in: submissions.map((s) => s._id) },
    })
      .lean()
      .exec();

    expect(reviews).toHaveLength(maxAttempts);
  });

  it('does not unlock the next activity from MAX_ATTEMPTS_REACHED', async () => {
    const progress = await getVentureProgress(ventureId);
    const index = progress.findIndex((p) => p.recordId === secondActivityRecordId);
    const next = progress[index + 1];
    if (next) expect(next.uiState).toBe('LOCKED');
  });
});
