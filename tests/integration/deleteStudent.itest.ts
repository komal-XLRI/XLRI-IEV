/**
 * Deleting a student, against a real MongoDB.
 *
 * Builds one student with a venture, a reviewed submission and attendance,
 * deletes them, and checks nothing in their name survives — while a faculty
 * account on the same venture is left alone.
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
const { createReview } = await import('@/services/reviews/reviewService');
const { saveAttendance } = await import('@/services/ventures/attendanceService');
const { deleteStudent } = await import('@/services/users/deleteStudent');
const { writeLegacySubmission } = await import('../support/legacySubmission');

const SUFFIX = `delete-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

let studentId: string;
let facultyId: string;
let mentorId: string;
let ventureId: string;
let recordIds: string[] = [];
let submissionId: string;

beforeAll(async () => {
  await connectToDatabase();

  studentId = (
    await createUser({
      role: 'STUDENT',
      name: 'Student To Delete',
      email: email('student'),
      status: 'ACTIVE',
      profile: { rollNumber: `ROLL-${SUFFIX}`, batch: '2026' },
    })
  ).userId;
  facultyId = (
    await createUser({
      role: 'FACULTY',
      name: 'Kept Faculty',
      email: email('faculty'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;
  mentorId = (
    await createUser({
      role: 'MENTOR',
      name: 'Kept Mentor',
      email: email('mentor'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  ventureId = (
    await createStudentVenture({
      studentId,
      ventureName: 'Doomed Venture',
      facultyId,
      mentorId,
      status: 'ACTIVE',
    })
  ).studentVentureId;

  const progress = await getVentureProgress(ventureId);
  recordIds = progress.map((p) => p.recordId);

  submissionId = (await writeLegacySubmission(progress[0]!.recordId, studentId, 'Some work'))
    .submissionId;
  await createReview(
    { submissionId, status: 'APPROVED', comments: 'Fine' },
    { userId: facultyId, role: 'FACULTY' },
  );

  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id').lean().exec();
  if (!admin) throw new Error('Run `npm run seed` before the integration tests.');
  await saveAttendance({
    ventureActivityId: progress[0]!.activity._id.toString(),
    date: new Date('2026-05-04T00:00:00.000Z'),
    entries: [{ studentVentureId: ventureId, status: 'PRESENT' }],
    markedBy: admin._id.toString(),
  });
});

afterAll(async () => {
  const ids = [facultyId, mentorId].filter(Boolean);
  await models.FacultyProfile.deleteMany({ userId: { $in: ids } }).exec();
  await models.MentorProfile.deleteMany({ userId: { $in: ids } }).exec();
  await models.User.deleteMany({ _id: { $in: ids } }).exec();
  await disconnectFromDatabase();
});

describe('deleting a student', () => {
  it('refuses when the typed email does not match', async () => {
    await expect(deleteStudent(studentId, 'someone@else.test')).rejects.toThrow(/does not match/i);
    expect(await models.User.countDocuments({ _id: studentId }).exec()).toBe(1);
  });

  it('refuses to delete an account that is not a student', async () => {
    await expect(deleteStudent(facultyId, email('faculty'))).rejects.toThrow(/only student/i);
  });

  it('removes the student and everything in their name', async () => {
    const result = await deleteStudent(studentId, email('student').toUpperCase());

    expect(result.removed.ventures).toBe(1);
    expect(result.removed.submissions).toBe(1);
    expect(result.removed.reviews).toBe(1);
    expect(result.removed.attendanceRecords).toBe(1);

    expect(await models.User.countDocuments({ _id: studentId }).exec()).toBe(0);
    expect(await models.StudentProfile.countDocuments({ userId: studentId }).exec()).toBe(0);
    expect(await models.StudentVenture.countDocuments({ _id: ventureId }).exec()).toBe(0);
    expect(
      await models.StudentVentureActivity.countDocuments({ studentVentureId: ventureId }).exec(),
    ).toBe(0);
    expect(
      await models.StudentSupportActivity.countDocuments({ studentVentureId: ventureId }).exec(),
    ).toBe(0);
    expect(
      await models.VentureSubmission.countDocuments({
        studentVentureActivityId: { $in: recordIds },
      }).exec(),
    ).toBe(0);
    expect(await models.Review.countDocuments({ submissionId }).exec()).toBe(0);
    expect(
      await models.VentureActivityAttendance.countDocuments({ studentVentureId: ventureId }).exec(),
    ).toBe(0);
  });

  it('leaves the faculty and mentor accounts alone', async () => {
    expect(await models.User.countDocuments({ _id: { $in: [facultyId, mentorId] } }).exec()).toBe(
      2,
    );
  });
});
