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
const { setPresentationsReceived } = await import('@/services/ventures/presentationService');
const { writeLegacySubmission } = await import('../support/legacySubmission');
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
let adminId: string;

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

  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id').lean().exec();
  if (!admin) throw new Error('Run `npm run seed` before the integration tests.');
  adminId = admin._id.toString();
});

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

  it('reviews a submission made under the old in-app flow', async () => {
    const result = await writeLegacySubmission(firstActivityRecordId, studentId, 'Attempt one');
    expect(result.attemptNumber).toBe(1);
    submissionId = result.submissionId;
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
});

describe('presentations', () => {
  // The checklist save replaces the whole set for an activity, and these suites
  // run against a shared, seeded database — so every save here carries over the
  // marks other students already have, and only ever moves this suite's record.
  async function othersReceived(ventureActivityId: string): Promise<string[]> {
    const rows = await models.StudentVentureActivity.find({
      ventureActivityId,
      studentVentureId: { $ne: ventureId },
      presentationReceivedAt: { $ne: null },
    })
      .select('_id')
      .lean()
      .exec();
    return rows.map((row) => row._id.toString());
  }

  async function activityOf(recordId: string): Promise<string> {
    const record = await models.StudentVentureActivity.findById(recordId).lean().exec();
    return record!.ventureActivityId.toString();
  }

  it('marks a presentation received and moves the record to PRESENTATION_RECEIVED', async () => {
    const activityId = await activityOf(secondActivityRecordId);
    const others = await othersReceived(activityId);

    const result = await setPresentationsReceived(
      activityId,
      [...others, secondActivityRecordId],
      adminId,
    );
    expect(result).toEqual({ marked: 1, cleared: 0 });

    const record = await models.StudentVentureActivity.findById(secondActivityRecordId)
      .lean()
      .exec();
    expect(record!.status).toBe('PRESENTATION_RECEIVED');
    expect(record!.presentationReceivedAt).not.toBeNull();
    expect(record!.presentationMarkedBy?.toString()).toBe(adminId);
  });

  it('does not complete the stage or unlock the next one on a presentation alone', async () => {
    const progress = await getVentureProgress(ventureId);
    const index = progress.findIndex((p) => p.recordId === secondActivityRecordId);
    expect(progress[index]!.record.completedAt).toBeNull();
    const next = progress[index + 1];
    if (next) expect(next.uiState).toBe('LOCKED');
  });

  it('is idempotent — saving the same checklist again changes nothing', async () => {
    const activityId = await activityOf(secondActivityRecordId);
    const others = await othersReceived(activityId);

    const result = await setPresentationsReceived(
      activityId,
      [...others, secondActivityRecordId],
      adminId,
    );
    expect(result).toEqual({ marked: 0, cleared: 0 });
  });

  it('returns the record to NOT_STARTED when the mark is withdrawn', async () => {
    const activityId = await activityOf(secondActivityRecordId);
    const others = await othersReceived(activityId);

    const result = await setPresentationsReceived(activityId, others, adminId);
    expect(result).toEqual({ marked: 0, cleared: 1 });

    const record = await models.StudentVentureActivity.findById(secondActivityRecordId)
      .lean()
      .exec();
    expect(record!.status).toBe('NOT_STARTED');
    expect(record!.presentationReceivedAt).toBeNull();
  });

  it('never un-presents a completed stage', async () => {
    const activityId = await activityOf(firstActivityRecordId);
    const others = await othersReceived(activityId);

    await setPresentationsReceived(activityId, [...others, firstActivityRecordId], adminId);
    const result = await setPresentationsReceived(activityId, others, adminId);
    expect(result.cleared).toBe(0);

    const after = await models.StudentVentureActivity.findById(firstActivityRecordId).lean().exec();
    expect(after!.status).toBe('COMPLETED');
    expect(after!.presentationReceivedAt).not.toBeNull();
  });

  it('refuses a record that is not on the activity', async () => {
    const activityId = await activityOf(secondActivityRecordId);
    await expect(
      setPresentationsReceived(activityId, [firstActivityRecordId], adminId),
    ).rejects.toThrow(/not on this venture activity/i);
  });
});
