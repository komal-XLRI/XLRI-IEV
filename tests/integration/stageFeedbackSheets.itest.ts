/**
 * Stage feedback sheets — an administrator uploads a spreadsheet for a stage,
 * rows are matched to students, and each student reads only their own rows —
 * against a real MongoDB.
 *
 * Requires MONGODB_URI and seeded activities. Run with `npm run test:integration`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { config as loadEnv } from 'dotenv';
import ExcelJS from 'exceljs';

loadEnv({ path: '.env.local', quiet: true });
loadEnv({ path: '.env', quiet: true });

process.env.AUTH_SECRET ??= 'integration-test-secret-at-least-32-characters';

const { connectToDatabase, disconnectFromDatabase } = await import('@/lib/db/mongoose');
const models = await import('@/models');
const { createUser } = await import('@/services/users/userService');
const { createStudentVenture, getVentureProgress } =
  await import('@/services/ventures/studentVentureService');
const sheets = await import('@/services/ventures/stageFeedbackSheetService');
const notifications = await import('@/services/notifications/notificationService');

const SUFFIX = `fs-${Date.now()}`;
let stageId: string;
let adminId: string;
const userIds: string[] = [];
const ventureIds: string[] = [];

interface TestStudent {
  userId: string;
  recordId: string;
  roll: string;
  name: string;
  venture: string;
  email: string;
}
let asha: TestStudent;
let ben: TestStudent;
let twin: TestStudent;

async function makeStudent(label: string, name: string): Promise<TestStudent> {
  const roll = `${label}-${SUFFIX}`.toUpperCase();
  const venture = `Venture ${label} ${SUFFIX}`;
  const email = `${label}.${SUFFIX}@example.test`;
  const { userId } = await createUser({
    role: 'STUDENT',
    name,
    email,
    status: 'ACTIVE',
    profile: { rollNumber: roll, batch: '2026' },
  });
  const { studentVentureId } = await createStudentVenture({
    studentId: userId,
    ventureName: venture,
    status: 'ACTIVE',
  });
  userIds.push(userId);
  ventureIds.push(studentVentureId);
  const progress = await getVentureProgress(studentVentureId);
  const recordId = progress.find((p) => p.activity._id.toString() === stageId)!.recordId;
  return { userId, recordId, roll, name, venture, email };
}

async function workbook(rows: string[][]): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Feedback');
  rows.forEach((row) => sheet.addRow(row));
  return new Uint8Array(await book.xlsx.writeBuffer());
}

const upload = async (title: string, rows: string[][]) =>
  sheets.uploadStageFeedbackSheet({
    ventureActivityId: stageId,
    title: `${title} ${SUFFIX}`,
    fileName: 'feedback.xlsx',
    actorId: adminId,
    bytes: await workbook(rows),
  });

const FORM_HEADINGS = [
  'Timestamp',
  'Email Address',
  "Evaluator's name",
  'Student & Startup Names',
  '1) Revenue model is clearly defined.',
  '5) One key suggestion',
];

beforeAll(async () => {
  await connectToDatabase();
  const stage = await models.VentureActivity.findOne({ status: 'ACTIVE' })
    .sort({ order: 1 })
    .lean()
    .exec();
  const admin = await models.User.findOne({ role: 'ADMIN' }).select('_id').lean().exec();
  if (!stage || !admin) throw new Error('Run `npm run seed` before the integration tests.');
  stageId = stage._id.toString();
  adminId = admin._id.toString();
  asha = await makeStudent('asha', `Asha Rao ${SUFFIX}`);
  ben = await makeStudent('ben', `Ben Iyer ${SUFFIX}`);
  // Same name as Ben: only the startup name can tell them apart.
  twin = await makeStudent('twin', `Ben Iyer ${SUFFIX}`);
});

afterAll(async () => {
  const uploaded = await models.StageFeedbackSheet.find({ title: { $regex: SUFFIX } })
    .select('_id')
    .lean()
    .exec();
  await models.StageFeedbackEntry.deleteMany({
    sheetId: { $in: uploaded.map((s) => s._id) },
  }).exec();
  await models.StageFeedbackSheet.deleteMany({ title: { $regex: SUFFIX } }).exec();
  await models.Notification.deleteMany({ recipientId: { $in: userIds } }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();
  await disconnectFromDatabase();
});

describe('a feedback form export matched by student name', () => {
  let sheetId: string;

  it('matches "Name - Startup", one row per evaluator, and reports the rest', async () => {
    const summary = await upload('Panel', [
      FORM_HEADINGS,
      ['2026-10-12', 'rao@x.test', 'Dr Rao', `${asha.name} - ${asha.venture}`, '2', 'Go deeper'],
      ['2026-10-12', 'iyer@x.test', 'Dr Iyer', `  ${asha.name.toUpperCase()} `, '3', ''],
      // A misspelt name still lands through the startup name.
      ['2026-10-13', 'rao@x.test', 'Dr Rao', `Benn Iyar - ${twin.venture}`, '4', 'Segment'],
      // Two students share this name and nothing says which.
      ['2026-10-13', 'rao@x.test', 'Dr Rao', ben.name, '1', ''],
      // The form's email column is the evaluator's — Ben's address here must not
      // hand this row to Ben.
      ['2026-10-14', ben.email, 'Dr Rao', 'Nobody Known - Nowhere', '1', 'Lost'],
    ]);
    sheetId = summary.id;

    expect(summary.matchedOn).toBe('Student & Startup Names');
    expect(summary.matchedRows).toBe(3);
    expect(summary.matchedStudents).toBe(2);
    expect(summary.students.map((s) => s.studentId).sort()).toEqual(
      [asha.userId, twin.userId].sort(),
    );
    expect(summary.unmatched).toEqual([
      {
        line: 5,
        identifier: ben.name,
        reason: expect.stringMatching(/2 students are called/),
      },
      {
        line: 6,
        identifier: 'Nobody Known - Nowhere',
        reason: 'No student has this name, and no startup has this name',
      },
    ]);
  });

  it('shows each student only their own rows, without the identity columns', async () => {
    const mine = await sheets.getStudentSheetFeedback(asha.userId, stageId);
    expect(mine).toHaveLength(2);
    expect(mine[0]!.fields).toEqual([
      { label: 'Timestamp', value: '2026-10-12' },
      { label: "Evaluator's name", value: 'Dr Rao' },
      { label: '1) Revenue model is clearly defined.', value: '2' },
      { label: '5) One key suggestion', value: 'Go deeper' },
    ]);
    expect(mine.flatMap((e) => e.fields).some((f) => f.label === 'Email Address')).toBe(false);

    expect(await sheets.getStudentSheetFeedback(ben.userId, stageId)).toEqual([]);
    const twins = await sheets.getStudentSheetFeedback(twin.userId, stageId);
    expect(
      twins.map((e) => e.fields.find((f) => f.label === '5) One key suggestion')?.value),
    ).toEqual(['Segment']);
  });

  it('tells each matched student once, linking to their stage', async () => {
    const { items } = await notifications.listNotifications(
      { userId: asha.userId, role: 'STUDENT' },
      50,
    );
    const shared = items.filter((n) => n.kind === 'feedback.sheet');
    expect(shared).toHaveLength(1);
    expect(shared[0]!.href).toBe(`/student/activities/${asha.recordId}`);
  });

  it('removing a sheet removes it from every student', async () => {
    await sheets.deleteStageFeedbackSheet(sheetId);
    expect(await sheets.getStudentSheetFeedback(asha.userId, stageId)).toEqual([]);
    expect(await models.StageFeedbackEntry.countDocuments({ sheetId })).toBe(0);
  });
});

describe('other ways of naming the student', () => {
  it('matches a roll number, and a duplicate name once the startup is given', async () => {
    const summary = await upload('Roll', [
      ['Roll No', 'Name', 'Feedback'],
      [ben.roll.toLowerCase(), '', 'By roll'],
      ['', `${ben.name} - ${ben.venture}`, 'By name and startup'],
    ]);
    expect(summary.unmatched).toEqual([]);
    expect(summary.students.map((s) => s.studentId)).toEqual([ben.userId]);
    expect((await sheets.getStudentSheetFeedback(ben.userId, stageId)).length).toBe(2);
  });

  it('refuses a sheet that matches nobody, and saves nothing', async () => {
    await expect(
      upload('Wrong', [
        ['Roll No', 'Feedback'],
        ['ZZZ-NOPE', 'x'],
      ]),
    ).rejects.toThrow(/None of the 1 rows matched/);
    expect(await models.StageFeedbackSheet.countDocuments({ title: `Wrong ${SUFFIX}` })).toBe(0);
  });
});
