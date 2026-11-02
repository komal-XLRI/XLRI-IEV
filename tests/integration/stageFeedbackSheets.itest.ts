/**
 * Stage feedback sheets — an administrator uploads a spreadsheet for a stage,
 * rows are matched to students, and each student reads only their own row —
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
let asha: { userId: string; recordId: string; roll: string };
let ben: { userId: string; recordId: string; roll: string };

async function makeStudent(label: string) {
  const roll = `${label}-${SUFFIX}`.toUpperCase();
  const { userId } = await createUser({
    role: 'STUDENT',
    name: `Student ${label} ${SUFFIX}`,
    email: `${label}.${SUFFIX}@example.test`,
    status: 'ACTIVE',
    profile: { rollNumber: roll, batch: '2026' },
  });
  const { studentVentureId } = await createStudentVenture({
    studentId: userId,
    ventureName: `Venture ${label} ${SUFFIX}`,
    status: 'ACTIVE',
  });
  userIds.push(userId);
  ventureIds.push(studentVentureId);
  const progress = await getVentureProgress(studentVentureId);
  const recordId = progress.find((p) => p.activity._id.toString() === stageId)!.recordId;
  return { userId, recordId, roll };
}

async function workbook(rows: string[][]): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const sheet = book.addWorksheet('Feedback');
  rows.forEach((row) => sheet.addRow(row));
  return new Uint8Array(await book.xlsx.writeBuffer());
}

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
  asha = await makeStudent('asha');
  ben = await makeStudent('ben');
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

describe('stage feedback sheets', () => {
  let sheetId: string;

  it('matches rows by roll number or email and reports the rest', async () => {
    const summary = await sheets.uploadStageFeedbackSheet({
      ventureActivityId: stageId,
      title: `Panel ${SUFFIX}`,
      fileName: 'panel.xlsx',
      actorId: adminId,
      bytes: await workbook([
        ['Name', 'Roll Number', 'Email', 'Mentor', 'Feedback'],
        ['Asha', asha.roll.toLowerCase(), '', 'Dr Rao', 'Strong customer insight'],
        ['Ben', '', `ben.${SUFFIX}@example.test`, 'Dr Iyer', 'Tighten the pricing'],
        ['Nobody', 'NOT-A-STUDENT', '', 'Dr Rao', 'Lost row'],
      ]),
    });
    sheetId = summary.id;

    expect(summary.matchedRows).toBe(2);
    expect(summary.matchedStudents).toBe(2);
    expect(summary.unmatched).toEqual([{ line: 4, identifier: 'NOT-A-STUDENT' }]);
    expect(summary.students.map((s) => s.studentId).sort()).toEqual(
      [asha.userId, ben.userId].sort(),
    );
  });

  it('shows each student only their own row, without the identity columns', async () => {
    const mine = await sheets.getStudentSheetFeedback(asha.userId, stageId);
    expect(mine).toHaveLength(1);
    expect(mine[0]!.fields).toEqual([
      { label: 'Mentor', value: 'Dr Rao' },
      { label: 'Feedback', value: 'Strong customer insight' },
    ]);

    const his = await sheets.getStudentSheetFeedback(ben.userId, stageId);
    expect(his.map((e) => e.fields.find((f) => f.label === 'Feedback')?.value)).toEqual([
      'Tighten the pricing',
    ]);
  });

  it('tells each matched student, linking to their stage', async () => {
    const { items } = await notifications.listNotifications(
      { userId: asha.userId, role: 'STUDENT' },
      50,
    );
    const shared = items.find((n) => n.kind === 'feedback.sheet');
    expect(shared?.href).toBe(`/student/activities/${asha.recordId}`);
  });

  it('refuses a sheet that matches nobody, and saves nothing', async () => {
    await expect(
      sheets.uploadStageFeedbackSheet({
        ventureActivityId: stageId,
        title: `Wrong ${SUFFIX}`,
        fileName: 'wrong.xlsx',
        actorId: adminId,
        bytes: await workbook([
          ['Roll No', 'Feedback'],
          ['ZZZ-NOPE', 'x'],
        ]),
      }),
    ).rejects.toThrow(/None of the 1 rows matched/);
    expect(await models.StageFeedbackSheet.countDocuments({ title: `Wrong ${SUFFIX}` })).toBe(0);
  });

  it('removing a sheet removes it from every student', async () => {
    await sheets.deleteStageFeedbackSheet(sheetId);
    expect(await sheets.getStudentSheetFeedback(asha.userId, stageId)).toEqual([]);
    expect(await models.StageFeedbackEntry.countDocuments({ sheetId })).toBe(0);
  });
});
