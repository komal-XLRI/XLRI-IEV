/**
 * Marking a stage complete by hand — for feedback collected outside the
 * feedback form — and taking it back, against a real MongoDB.
 *
 * Requires MONGODB_URI and seeded activities. Run with `npm run test:integration`.
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
const { toTimeline } = await import('@/services/ventures/timeline');
const completion = await import('@/services/ventures/stageCompletionService');
const notifications = await import('@/services/notifications/notificationService');

const SUFFIX = `sc-${Date.now()}`;
let first: { _id: { toString(): string }; activityCode: string };
let second: { _id: { toString(): string }; activityCode: string };
let adminId: string;
const userIds: string[] = [];
const ventureIds: string[] = [];
let student: { userId: string; ventureId: string };

async function records(ventureId: string) {
  return toTimeline(await getVentureProgress(ventureId));
}

const recordOn = async (activityId: string) =>
  (await records(student.ventureId)).find((r) => r.activityId === activityId)!;

beforeAll(async () => {
  await connectToDatabase();
  const stages = await models.VentureActivity.find({ status: 'ACTIVE' })
    .sort({ order: 1 })
    .limit(2)
    .lean()
    .exec();
  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id').lean().exec();
  if (stages.length < 2 || !admin) throw new Error('Run `npm run seed` first.');
  [first, second] = stages as unknown as [typeof first, typeof second];
  adminId = admin._id.toString();

  const { userId } = await createUser({
    role: 'STUDENT',
    name: `Completion Student ${SUFFIX}`,
    email: `student.${SUFFIX}@example.test`,
    status: 'ACTIVE',
    profile: { rollNumber: `R-${SUFFIX}`, batch: '2026' },
  });
  const { studentVentureId } = await createStudentVenture({
    studentId: userId,
    ventureName: `Venture ${SUFFIX}`,
    status: 'ACTIVE',
  });
  userIds.push(userId);
  ventureIds.push(studentVentureId);
  student = { userId, ventureId: studentVentureId };
});

afterAll(async () => {
  await models.Notification.deleteMany({ recipientId: { $in: userIds } }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();
  await disconnectFromDatabase();
});

describe('marking a stage complete by hand', () => {
  it('lists the student, with the second stage flagged as still locked', async () => {
    const rows = await completion.listStageCompletion(second._id.toString());
    const mine = rows.find((r) => r.studentName === `Completion Student ${SUFFIX}`)!;
    expect(mine.status).toBe('NOT_STARTED');
    expect(mine.previousComplete).toBe(false);
  });

  it('completes the stage, opens the next one and tells the student', async () => {
    const record = await recordOn(first._id.toString());
    const result = await completion.markStageComplete(
      first._id.toString(),
      [record.recordId],
      adminId,
    );
    expect(result).toEqual({ completed: 1, alreadyComplete: 0 });

    const timeline = await records(student.ventureId);
    expect(timeline.find((r) => r.activityId === first._id.toString())!.status).toBe('COMPLETED');
    const next = timeline.find((r) => r.activityId === second._id.toString())!;
    expect(next.unlocked).toBe(true);

    const venture = await models.StudentVenture.findById(student.ventureId).lean().exec();
    expect(venture!.currentVentureActivityId?.toString()).toBe(second._id.toString());

    const { items } = await notifications.listNotifications(
      { userId: student.userId, role: 'STUDENT' },
      20,
    );
    expect(items.some((n) => n.kind === 'stage.completed')).toBe(true);

    const rows = await completion.listStageCompletion(first._id.toString());
    expect(rows.find((r) => r.recordId === record.recordId)!.markedByAdmin).toBe(true);
  });

  it('leaves an already-complete stage alone', async () => {
    const record = await recordOn(first._id.toString());
    expect(
      await completion.markStageComplete(first._id.toString(), [record.recordId], adminId),
    ).toEqual({ completed: 0, alreadyComplete: 1 });
  });

  it('refuses a student who is not on the stage', async () => {
    const other = await recordOn(second._id.toString());
    await expect(
      completion.markStageComplete(first._id.toString(), [other.recordId], adminId),
    ).rejects.toThrow(/not on this venture activity/);
  });

  it('reopens a hand-marked stage and locks the next one again', async () => {
    const record = await recordOn(first._id.toString());
    expect(await completion.reopenStage(first._id.toString(), [record.recordId], adminId)).toEqual({
      reopened: 1,
      skipped: 0,
    });

    const reopened = await recordOn(first._id.toString());
    expect(reopened.status).toBe('NOT_STARTED');
    expect((await recordOn(second._id.toString())).unlocked).toBe(false);
  });

  it('never reopens a stage completed on mentor feedback', async () => {
    const record = await recordOn(first._id.toString());
    // Completed the feedback way: no `completedBy`.
    await models.StudentVentureActivity.updateOne(
      { _id: record.recordId },
      { $set: { status: 'COMPLETED', completedAt: new Date(), completedBy: null } },
    ).exec();
    expect(await completion.reopenStage(first._id.toString(), [record.recordId], adminId)).toEqual({
      reopened: 0,
      skipped: 1,
    });
    expect((await recordOn(first._id.toString())).status).toBe('COMPLETED');
  });
});
