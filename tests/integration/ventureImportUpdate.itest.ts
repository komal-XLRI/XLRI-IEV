/**
 * Editing ventures through the import, against a real MongoDB.
 *
 * A student who already had a venture used to fail the row outright, which
 * made the import a create-only tool: the only way to correct a spreadsheet
 * mistake across fifty ventures was fifty visits to the edit form. What has to
 * hold now is that a second import *edits* rather than duplicating or
 * clobbering — and specifically that a blank cell means "leave this alone",
 * because an edit file carries the columns being changed and nothing else.
 *
 * Every fixture here is created by this file and removed in `afterAll`.
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
const { ventureImport } = await import('@/services/import/specs');
const { runImport } = await import('@/lib/import/runner');

const SUFFIX = `upd-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;
const roll = (n: number) => `UPD${n}-${SUFFIX}`.toUpperCase();

let student: string;
let facultyOne: string;
let facultyTwo: string;
let mentorOne: string;

const HEADER = ventureImport.columns.map((column) => column.label).join(',');

function csv(...rows: Array<Record<string, string>>): string {
  const line = (row: Record<string, string>) =>
    ventureImport.columns
      .map((column) => {
        const value = row[column.field] ?? '';
        return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
      })
      .join(',');

  return [HEADER, ...rows.map(line)].join('\r\n');
}

async function venture() {
  const found = await models.StudentVenture.findOne({ studentId: student }).lean().exec();
  return found!;
}

async function ownVentureIds(): Promise<string[]> {
  const ventures = await models.StudentVenture.find({ studentId: student })
    .select('_id')
    .lean()
    .exec();

  return ventures.map((row) => row._id.toString());
}

beforeAll(async () => {
  await connectToDatabase();

  student = (
    await createUser({
      role: 'STUDENT',
      name: 'Update Student',
      email: email('student'),
      status: 'ACTIVE',
      profile: { rollNumber: roll(1), batch: '2026' },
    })
  ).userId;

  facultyOne = (
    await createUser({
      role: 'FACULTY',
      name: 'Faculty One',
      email: email('faculty-one'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  facultyTwo = (
    await createUser({
      role: 'FACULTY',
      name: 'Faculty Two',
      email: email('faculty-two'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  mentorOne = (
    await createUser({
      role: 'MENTOR',
      name: 'Mentor One',
      email: email('mentor-one'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;

  // The record every test below edits.
  await runImport(
    ventureImport,
    csv({
      rollNumber: roll(1),
      ventureName: 'Original Name',
      industry: 'Retail technology',
      targetMarket: 'Tier-2 kirana stores',
      fundingStatus: 'Bootstrapped',
      facultyEmail: email('faculty-one'),
      mentorEmail: email('mentor-one'),
      status: 'On hold',
    }),
    { dryRun: false },
  );
});

afterAll(async () => {
  const ventureIds = await ownVentureIds();
  const userIds = [student, facultyOne, facultyTwo, mentorOne].filter(Boolean);

  await models.VentureActivityAttendance.deleteMany({
    studentVentureId: { $in: ventureIds },
  }).exec();
  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

describe('the fixture', () => {
  it('was created, on hold, with its reviewers', async () => {
    const existing = await venture();

    expect(existing.ventureName).toBe('Original Name');
    expect(existing.status).toBe('ON_HOLD');
    expect(existing.facultyId?.toString()).toBe(facultyOne);
  });
});

describe('previewing an edit', () => {
  it('says the row will replace an existing venture, and writes nothing', async () => {
    const outcome = await runImport(
      ventureImport,
      csv({ rollNumber: roll(1), ventureName: 'Renamed In Preview' }),
      { dryRun: true },
    );

    expect(outcome.updatedRows).toBe(1);
    expect(outcome.results[0]!.notes.join(' ')).toContain('Original Name');

    // The whole point of a preview is that it did not do it.
    expect((await venture()).ventureName).toBe('Original Name');
  });
});

describe('committing an edit', () => {
  it('updates instead of failing, and does not create a second venture', async () => {
    const outcome = await runImport(
      ventureImport,
      csv({ rollNumber: roll(1), ventureName: 'Renamed Venture' }),
      { dryRun: false },
    );

    expect(outcome.updatedRows).toBe(1);
    expect(outcome.createdRows).toBe(0);
    expect(outcome.failedRows).toBe(0);
    expect(outcome.results[0]!.status).toBe('updated');

    expect(await ownVentureIds()).toHaveLength(1);
    expect((await venture()).ventureName).toBe('Renamed Venture');
  });

  it('leaves the columns the file left blank exactly as they were', async () => {
    // The file above carried a roll number and a name. Everything else must
    // have survived it, or an edit becomes an accidental erasure.
    const existing = await venture();

    expect(existing.industry).toBe('Retail technology');
    expect(existing.targetMarket).toBe('Tier-2 kirana stores');
    expect(existing.fundingStatus).toBe('Bootstrapped');
  });

  it('keeps a paused venture paused when the status cell is blank', async () => {
    // Defaulting a blank status to ACTIVE would restart every venture that had
    // been put on hold, which is the failure this guards.
    expect((await venture()).status).toBe('ON_HOLD');
  });

  it('keeps the current reviewers when the email columns are blank', async () => {
    const existing = await venture();

    expect(existing.facultyId?.toString()).toBe(facultyOne);
    expect(existing.mentorId?.toString()).toBe(mentorOne);
  });
});

describe('editing the parts that were named', () => {
  it('reassigns only the reviewer the file names, and keeps the other', async () => {
    const outcome = await runImport(
      ventureImport,
      csv({
        rollNumber: roll(1),
        ventureName: 'Renamed Venture',
        facultyEmail: email('faculty-two'),
      }),
      { dryRun: false },
    );

    expect(outcome.updatedRows).toBe(1);

    const existing = await venture();
    expect(existing.facultyId?.toString()).toBe(facultyTwo);
    expect(existing.mentorId?.toString()).toBe(mentorOne);
  });

  it('carries the new reviewer down to the activity records', async () => {
    // Assignment is what grants review rights, so a venture whose activities
    // still name the previous faculty member has not really been reassigned.
    const existing = await venture();

    const stale = await models.StudentVentureActivity.countDocuments({
      studentVentureId: existing._id,
      facultyId: facultyOne,
    }).exec();

    expect(stale).toBe(0);
  });

  it('changes a status that was written down', async () => {
    await runImport(
      ventureImport,
      csv({ rollNumber: roll(1), ventureName: 'Renamed Venture', status: 'Completed' }),
      { dryRun: false },
    );

    expect((await venture()).status).toBe('COMPLETED');
  });
});
