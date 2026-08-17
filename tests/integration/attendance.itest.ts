/**
 * Venture Activity attendance, against a real MongoDB.
 *
 * The load-bearing test here is the last one: attendance must not touch the
 * rules. This codebase has three of them — sequential progression, the attempt
 * limit and dual review — and an attendance field is exactly the kind of
 * addition that quietly grows into a fourth. Marking a student absent has to
 * leave every one of them behaving identically.
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
const {
  getAttendanceRoster,
  getAttendanceSummary,
  getStudentAttendance,
  markAllVentureAttendance,
  markVentureAttendance,
} = await import('@/services/ventures/attendanceService');

const SUFFIX = `att-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;

let studentOneId: string;
let studentTwoId: string;
let ventureOneId: string;
let ventureTwoId: string;
let activityId: string;
let recordOneId: string;
let recordTwoId: string;

beforeAll(async () => {
  await connectToDatabase();

  if ((await models.VentureActivity.countDocuments({ status: 'ACTIVE' }).exec()) < 2) {
    throw new Error('Run `npm run seed` before the integration tests.');
  }

  studentOneId = (
    await createUser({
      role: 'STUDENT',
      name: 'Attendance One',
      email: email('one'),
      status: 'ACTIVE',
      profile: { rollNumber: `ATT1-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  studentTwoId = (
    await createUser({
      role: 'STUDENT',
      name: 'Attendance Two',
      email: email('two'),
      status: 'ACTIVE',
      profile: { rollNumber: `ATT2-${SUFFIX}`, batch: '2026' },
    })
  ).userId;

  ventureOneId = (
    await createStudentVenture({
      studentId: studentOneId,
      ventureName: `Attendance Venture One ${SUFFIX}`,
      status: 'ACTIVE',
    })
  ).studentVentureId;

  ventureTwoId = (
    await createStudentVenture({
      studentId: studentTwoId,
      ventureName: `Attendance Venture Two ${SUFFIX}`,
      status: 'ACTIVE',
    })
  ).studentVentureId;

  const progress = await getVentureProgress(ventureOneId);
  activityId = progress[0]!.activity._id.toString();
  recordOneId = progress[0]!.recordId;

  const other = await getVentureProgress(ventureTwoId);
  recordTwoId = other[0]!.recordId;
});

afterAll(async () => {
  const ventureIds = [ventureOneId, ventureTwoId].filter(Boolean);
  const userIds = [studentOneId, studentTwoId].filter(Boolean);

  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

describe('the default', () => {
  it('creates every activity record as PENDING', async () => {
    const records = await models.StudentVentureActivity.find({ studentVentureId: ventureOneId })
      .select('attendanceStatus')
      .lean()
      .exec();

    expect(records.length).toBeGreaterThan(0);
    expect(records.every((record) => record.attendanceStatus === 'PENDING')).toBe(true);
  });

  it('rejects a status outside the enum at the model layer', async () => {
    await expect(
      models.StudentVentureActivity.updateOne(
        { _id: recordOneId },
        { $set: { attendanceStatus: 'LATE' } },
        { runValidators: true },
      ).exec(),
    ).rejects.toThrow();
  });
});

describe('the roster', () => {
  it('lists every student on the activity with their venture', async () => {
    const roster = await getAttendanceRoster(activityId);
    const mine = roster.rows.filter((row) => [recordOneId, recordTwoId].includes(row.recordId));

    expect(mine).toHaveLength(2);
    expect(mine.map((row) => row.studentName).sort()).toEqual([
      'Attendance One',
      'Attendance Two',
    ]);
    expect(mine.every((row) => row.ventureName.includes(SUFFIX))).toBe(true);
  });

  it('counts by status', async () => {
    const roster = await getAttendanceRoster(activityId);
    expect(roster.counts.PENDING).toBeGreaterThanOrEqual(2);
    expect(roster.counts).toHaveProperty('PRESENT');
    expect(roster.counts).toHaveProperty('ABSENT');
  });

  it('searches by student name, email or venture', async () => {
    expect((await getAttendanceRoster(activityId, { q: 'Attendance One' })).rows).toHaveLength(1);
    expect((await getAttendanceRoster(activityId, { q: email('two') })).rows).toHaveLength(1);
    expect(
      (await getAttendanceRoster(activityId, { q: `Attendance Venture One ${SUFFIX}` })).rows,
    ).toHaveLength(1);
  });

  it('returns an empty row list rather than throwing when nothing matches', async () => {
    const roster = await getAttendanceRoster(activityId, { q: 'nobody-by-that-name' });
    expect(roster.rows).toEqual([]);
    // Counts still describe the cohort, not the search.
    expect(roster.counts.PENDING).toBeGreaterThanOrEqual(2);
  });

  it('refuses an unknown activity', async () => {
    await expect(getAttendanceRoster('6a76b36ee92631a0e17ee999')).rejects.toThrow(/not found/i);
  });
});

describe('marking attendance', () => {
  it('marks individual students and leaves the others alone', async () => {
    const result = await markVentureAttendance([
      { recordId: recordOneId, attendanceStatus: 'PRESENT' },
      { recordId: recordTwoId, attendanceStatus: 'ABSENT' },
    ]);

    expect(result.updated).toBe(2);

    const roster = await getAttendanceRoster(activityId);
    const byId = new Map(roster.rows.map((row) => [row.recordId, row.attendanceStatus]));
    expect(byId.get(recordOneId)).toBe('PRESENT');
    expect(byId.get(recordTwoId)).toBe('ABSENT');
  });

  it('is idempotent — re-marking the same status changes nothing', async () => {
    const again = await markVentureAttendance([
      { recordId: recordOneId, attendanceStatus: 'PRESENT' },
    ]);
    expect(again.updated).toBe(0);
  });

  it('can be corrected back to PENDING', async () => {
    await markVentureAttendance([{ recordId: recordTwoId, attendanceStatus: 'PENDING' }]);

    const roster = await getAttendanceRoster(activityId);
    const row = roster.rows.find((entry) => entry.recordId === recordTwoId);
    expect(row?.attendanceStatus).toBe('PENDING');
  });

  it('refuses the whole batch if any record is unknown', async () => {
    // Partially applying a roster would leave the register half-marked with no
    // indication of which half.
    await expect(
      markVentureAttendance([
        { recordId: recordOneId, attendanceStatus: 'ABSENT' },
        { recordId: '6a76b36ee92631a0e17ee999', attendanceStatus: 'ABSENT' },
      ]),
    ).rejects.toThrow(/no longer exist/i);

    const roster = await getAttendanceRoster(activityId);
    const row = roster.rows.find((entry) => entry.recordId === recordOneId);
    expect(row?.attendanceStatus).toBe('PRESENT');
  });

  it('does nothing for an empty list', async () => {
    expect(await markVentureAttendance([])).toEqual({ updated: 0 });
  });

  it('does not touch updatedAt, which the review queue reads as "waiting since"', async () => {
    const before = await models.StudentVentureActivity.findById(recordOneId)
      .select('updatedAt')
      .lean()
      .exec();

    await markVentureAttendance([{ recordId: recordOneId, attendanceStatus: 'ABSENT' }]);
    await markAllVentureAttendance(activityId, 'PRESENT');

    const after = await models.StudentVentureActivity.findById(recordOneId)
      .select('updatedAt attendanceStatus')
      .lean()
      .exec();

    // Taking a register must not reorder the reviewers' queue or reset how
    // long a submission has been shown as waiting.
    expect(after!.updatedAt.getTime()).toBe(before!.updatedAt.getTime());
    expect(after!.attendanceStatus).toBe('PRESENT');
  });

  it('marks everyone at once', async () => {
    await markAllVentureAttendance(activityId, 'PRESENT');

    const roster = await getAttendanceRoster(activityId);
    expect(roster.rows.every((row) => row.attendanceStatus === 'PRESENT')).toBe(true);
    expect(roster.counts.PENDING).toBe(0);
    expect(roster.counts.ABSENT).toBe(0);
  });

  it('only touches the activity it was given', async () => {
    const progress = await getVentureProgress(ventureOneId);
    const second = progress[1]!;
    expect(second.record.attendanceStatus).toBe('PENDING');
  });
});

describe('reading attendance back', () => {
  it('summarises every activity', async () => {
    const summary = await getAttendanceSummary();
    const row = summary.find((entry) => entry.ventureActivityId === activityId);

    expect(row).toBeDefined();
    expect(row!.present).toBeGreaterThanOrEqual(2);
    expect(row!.total).toBe(row!.present + row!.absent + row!.pending);
  });

  it('exposes attendance on the student timeline', async () => {
    const progress = await getVentureProgress(ventureOneId);
    expect(progress[0]!.record.attendanceStatus).toBe('PRESENT');
  });

  it('maps a venture’s attendance by activity', async () => {
    const map = await getStudentAttendance(ventureOneId);
    expect(map.get(activityId)).toBe('PRESENT');
  });
});

describe('attendance changes no rule', () => {
  it('leaves progression, attempts and review state untouched when marked absent', async () => {
    const before = await getVentureProgress(ventureOneId);

    await markVentureAttendance([{ recordId: recordOneId, attendanceStatus: 'ABSENT' }]);

    const after = await getVentureProgress(ventureOneId);

    // Compare the whole derived read model, field by field, minus attendance
    // itself. If adding this field ever starts gating something, this fails.
    expect(after).toHaveLength(before.length);
    after.forEach((row, index) => {
      const previous = before[index]!;
      expect(row.uiState).toBe(previous.uiState);
      expect(row.unlocked).toBe(previous.unlocked);
      expect(row.record.status).toBe(previous.record.status);
      expect(row.record.attemptNumber).toBe(previous.record.attemptNumber);
      expect(row.record.facultyReviewStatus).toBe(previous.record.facultyReviewStatus);
      expect(row.record.mentorReviewStatus).toBe(previous.record.mentorReviewStatus);
      expect(row.attempt.canSubmit).toBe(previous.attempt.canSubmit);
      expect(row.attempt.attemptsRemaining).toBe(previous.attempt.attemptsRemaining);
      expect(row.reviewSummary).toBe(previous.reviewSummary);
    });
  });

  it('still allows a submission from a student marked absent', async () => {
    const progress = await getVentureProgress(ventureOneId);
    const first = progress[0]!;

    expect(first.record.attendanceStatus).toBe('ABSENT');
    expect(first.attempt.canSubmit).toBe(true);
  });
});
