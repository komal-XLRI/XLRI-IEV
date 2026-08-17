/**
 * The student file, against a real MongoDB.
 *
 * The difficulty here is entirely in the joins: a review belongs to a
 * submission, which belongs to an activity record, which belongs to a venture,
 * which belongs to the student. Each hop is a chance to attach one student's
 * work to another's file — which is why the last block builds a *second*
 * student and asserts nothing crosses between them.
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
const { createStudentVenture, getVentureProgress } = await import(
  '@/services/ventures/studentVentureService'
);
const { createSubmission } = await import('@/services/submissions/submissionService');
const { createReview } = await import('@/services/reviews/reviewService');
const { markVentureAttendance } = await import('@/services/ventures/attendanceService');
const { getStudentDossier } = await import('@/services/students/studentDossier');

const SUFFIX = `dossier-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

let studentId: string;
let otherStudentId: string;
let noVentureStudentId: string;
let facultyId: string;
let mentorId: string;
let ventureId: string;
let otherVentureId: string;
let firstRecordId: string;

beforeAll(async () => {
  await connectToDatabase();

  if ((await models.VentureActivity.countDocuments({ status: 'ACTIVE' }).exec()) < 2) {
    throw new Error('Run `npm run seed` before the integration tests.');
  }

  studentId = (
    await createUser({
      role: 'STUDENT',
      name: 'Dossier Student',
      email: email('student'),
      phone: '+91 90000 00001',
      status: 'ACTIVE',
      profile: {
        rollNumber: `DOS1-${SUFFIX}`,
        batch: '2026',
        cluster: 'B',
        background: 'Family runs a printing press.',
        strengths: 'Operations, customer conversations.',
        weakness: 'Financial modelling.',
        personalContext: 'Commutes from Ranchi on weekends.',
      },
    })
  ).userId;

  otherStudentId = (
    await createUser({
      role: 'STUDENT',
      name: 'Other Student',
      email: email('other'),
      status: 'ACTIVE',
      profile: { rollNumber: `DOS2-${SUFFIX}`, batch: '2027' },
    })
  ).userId;

  noVentureStudentId = (
    await createUser({
      role: 'STUDENT',
      name: 'Ventureless Student',
      email: email('none'),
      status: 'ACTIVE',
      profile: { rollNumber: `DOS3-${SUFFIX}`, batch: '2027' },
    })
  ).userId;

  facultyId = (
    await createUser({
      role: 'FACULTY',
      name: 'Dossier Faculty',
      email: email('faculty'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  mentorId = (
    await createUser({
      role: 'MENTOR',
      name: 'Dossier Mentor',
      email: email('mentor'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  ventureId = (
    await createStudentVenture({
      studentId,
      ventureName: `Dossier Venture ${SUFFIX}`,
      ventureTitle: 'Short-run printing for local businesses',
      industry: 'Manufacturing',
      facultyId,
      mentorId,
      status: 'ACTIVE',
    })
  ).studentVentureId;

  otherVentureId = (
    await createStudentVenture({
      studentId: otherStudentId,
      ventureName: `Other Venture ${SUFFIX}`,
      facultyId,
      mentorId,
      status: 'ACTIVE',
    })
  ).studentVentureId;

  // One full attempt on the first activity for each student, so both files have
  // submissions and reviews that could be confused with each other.
  for (const [venture, owner, label] of [
    [ventureId, studentId, 'mine'],
    [otherVentureId, otherStudentId, 'theirs'],
  ] as const) {
    const progress = await getVentureProgress(venture);
    const first = progress[0]!;

    if (venture === ventureId) firstRecordId = first.recordId;

    await models.Evidence.create({
      submissionId: null,
      studentVentureActivityId: first.recordId,
      fileName: `${label}.pdf`,
      fileUrl: `https://res.cloudinary.com/demo/raw/upload/${SUFFIX}/${label}.pdf`,
      publicId: `iev-tracker/evidence/${first.recordId}/${label}`,
      fileType: 'application/pdf',
      resourceType: 'raw',
      fileSize: 2048,
      uploadedBy: owner,
      uploadedAt: new Date(),
    });

    const submission = await createSubmission(
      {
        studentVentureActivityId: first.recordId,
        title: `${label} submission`,
        content: `Body of the ${label} submission.`,
      },
      owner,
    );

    await createReview(
      { submissionId: submission.submissionId, status: 'APPROVED', comments: `${label} verdict` },
      { userId: facultyId, role: 'FACULTY' },
    );
  }

  await markVentureAttendance([{ recordId: firstRecordId, attendanceStatus: 'PRESENT' }]);
});

afterAll(async () => {
  const userIds = [studentId, otherStudentId, noVentureStudentId, facultyId, mentorId].filter(
    Boolean,
  );
  const ventureIds = [ventureId, otherVentureId].filter(Boolean);

  const records = await models.StudentVentureActivity.find({
    studentVentureId: { $in: ventureIds },
  })
    .select('_id')
    .lean()
    .exec();
  const recordIds = records.map((r) => r._id);
  const submissions = await models.VentureSubmission.find({
    studentVentureActivityId: { $in: recordIds },
  })
    .select('_id')
    .lean()
    .exec();

  await models.Review.deleteMany({ submissionId: { $in: submissions.map((s) => s._id) } }).exec();
  await models.VentureSubmission.deleteMany({
    studentVentureActivityId: { $in: recordIds },
  }).exec();
  await models.Evidence.deleteMany({ studentVentureActivityId: { $in: recordIds } }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.FacultyProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.MentorProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

describe('the account and profile', () => {
  it('returns the student’s own details', async () => {
    const dossier = await getStudentDossier(studentId);

    expect(dossier.user.name).toBe('Dossier Student');
    expect(dossier.user.email).toBe(email('student'));
    expect(dossier.user.phone).toBe('+91 90000 00001');
    expect(dossier.user.status).toBe('ACTIVE');
  });

  it('returns every profile field, including the free-text ones', async () => {
    const { profile } = await getStudentDossier(studentId);

    expect(profile).toMatchObject({
      rollNumber: `DOS1-${SUFFIX}`.toUpperCase(),
      batch: '2026',
      cluster: 'B',
      background: 'Family runs a printing press.',
      strengths: 'Operations, customer conversations.',
      weakness: 'Financial modelling.',
      personalContext: 'Commutes from Ranchi on weekends.',
    });
  });

  it('refuses an account that is not a student', async () => {
    await expect(getStudentDossier(facultyId)).rejects.toThrow(/not a student/i);
  });

  it('refuses an unknown id', async () => {
    await expect(getStudentDossier('6a76b36ee92631a0e17ee999')).rejects.toThrow(/not found/i);
  });
});

describe('the venture and its reviewers', () => {
  it('returns the venture with both reviewers resolved by name', async () => {
    const { venture } = await getStudentDossier(studentId);

    expect(venture?.ventureName).toBe(`Dossier Venture ${SUFFIX}`);
    expect(venture?.ventureTitle).toBe('Short-run printing for local businesses');
    expect(venture?.industry).toBe('Manufacturing');
    expect(venture?.facultyName).toBe('Dossier Faculty');
    expect(venture?.mentorName).toBe('Dossier Mentor');
  });

  it('handles a student with no venture instead of throwing', async () => {
    // The empty case is a real one — a student exists before their venture does.
    const dossier = await getStudentDossier(noVentureStudentId);

    expect(dossier.venture).toBeNull();
    expect(dossier.progress).toEqual([]);
    expect(dossier.submissions).toEqual([]);
    expect(dossier.support).toEqual([]);
    expect(dossier.totals.activitiesTotal).toBe(0);
    expect(dossier.totals.percentage).toBe(0);
  });
});

describe('activities, submissions and reviews', () => {
  it('returns one progress row per venture activity', async () => {
    const dossier = await getStudentDossier(studentId);
    const activityCount = await models.VentureActivity.countDocuments({ status: 'ACTIVE' }).exec();

    expect(dossier.progress).toHaveLength(activityCount);
    expect(dossier.totals.activitiesTotal).toBe(activityCount);
  });

  it('returns the submission with its evidence count and verdict', async () => {
    const { submissions } = await getStudentDossier(studentId);

    expect(submissions).toHaveLength(1);
    const [submission] = submissions;

    expect(submission!.title).toBe('mine submission');
    expect(submission!.attemptNumber).toBe(1);
    expect(submission!.activityCode).toBeTruthy();
    expect(submission!.evidenceCount).toBe(1);
    expect(submission!.reviews).toHaveLength(1);
    expect(submission!.reviews[0]).toMatchObject({
      reviewerName: 'Dossier Faculty',
      reviewerType: 'FACULTY',
      status: 'APPROVED',
      comments: 'mine verdict',
    });
  });

  it('counts attempts, submissions and verdicts', async () => {
    const { totals } = await getStudentDossier(studentId);

    expect(totals.submissions).toBe(1);
    expect(totals.attemptsUsed).toBe(1);
    expect(totals.reviewsReceived).toBe(1);
  });

  it('includes venture activity attendance', async () => {
    const { totals } = await getStudentDossier(studentId);

    expect(totals.ventureAttendancePresent).toBe(1);
    expect(totals.ventureAttendancePending).toBeGreaterThan(0);
  });

  it('includes the support activity records', async () => {
    const { support, totals } = await getStudentDossier(studentId);

    expect(support.length).toBeGreaterThan(0);
    expect(totals.supportTotal).toBe(support.length);
  });
});

describe('one student’s file never contains another’s work', () => {
  it('keeps submissions and reviews on the right student', async () => {
    const mine = await getStudentDossier(studentId);
    const theirs = await getStudentDossier(otherStudentId);

    expect(mine.submissions.map((s) => s.title)).toEqual(['mine submission']);
    expect(theirs.submissions.map((s) => s.title)).toEqual(['theirs submission']);

    expect(mine.submissions[0]!.reviews[0]!.comments).toBe('mine verdict');
    expect(theirs.submissions[0]!.reviews[0]!.comments).toBe('theirs verdict');
  });

  it('keeps the venture and attendance on the right student', async () => {
    const theirs = await getStudentDossier(otherStudentId);

    expect(theirs.venture?.ventureName).toBe(`Other Venture ${SUFFIX}`);
    // Attendance was marked only on the first student's record.
    expect(theirs.totals.ventureAttendancePresent).toBe(0);
  });
});
