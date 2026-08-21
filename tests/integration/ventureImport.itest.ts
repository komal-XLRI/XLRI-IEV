/**
 * Bulk venture import, against a real MongoDB.
 *
 * The thing under test is not the CSV parser — that has its own unit spec —
 * but the join: a spreadsheet says "IEV101", and the import has to turn that
 * into the right person, refuse the wrong one, and go through the same service
 * call the form uses so an imported venture is not a second-class record.
 *
 * Every fixture here is created by this file and removed in `afterAll`. No
 * test may reach for a seeded venture: a spec that damages real data to prove
 * a point is worse than no spec.
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
const { buildTemplate, runImport } = await import('@/lib/import/runner');

const SUFFIX = `imp-${Date.now()}`;
const email = (label: string) => `${label}.${SUFFIX}@example.test`;
const roll = (n: number) => `IMP${n}-${SUFFIX}`.toUpperCase();

let studentOne: string;
let studentTwo: string;
let studentThree: string;
let facultyId: string;
let mentorId: string;

/** Header row taken from the spec, so the file is what the template promises. */
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

/** Ventures this spec created, so cleanup never guesses. */
async function ownVentureIds(): Promise<string[]> {
  const ventures = await models.StudentVenture.find({
    studentId: { $in: [studentOne, studentTwo, studentThree].filter(Boolean) },
  })
    .select('_id')
    .lean()
    .exec();

  return ventures.map((venture) => venture._id.toString());
}

beforeAll(async () => {
  await connectToDatabase();

  studentOne = (
    await createUser({
      role: 'STUDENT',
      name: 'Import One',
      email: email('one'),
      status: 'ACTIVE',
      profile: { rollNumber: roll(1), batch: '2026' },
    })
  ).userId;

  studentTwo = (
    await createUser({
      role: 'STUDENT',
      name: 'Import Two',
      email: email('two'),
      status: 'ACTIVE',
      profile: { rollNumber: roll(2), batch: '2026' },
    })
  ).userId;

  studentThree = (
    await createUser({
      role: 'STUDENT',
      name: 'Import Three',
      email: email('three'),
      status: 'ACTIVE',
      profile: { rollNumber: roll(3), batch: '2026' },
    })
  ).userId;

  facultyId = (
    await createUser({
      role: 'FACULTY',
      name: 'Import Faculty',
      email: email('faculty'),
      status: 'ACTIVE',
      // `createUser` reads this unconditionally for every role; omitting it
      // throws a TypeError rather than a validation error.
      profile: {},
    })
  ).userId;

  mentorId = (
    await createUser({
      role: 'MENTOR',
      name: 'Import Mentor',
      email: email('mentor'),
      status: 'ACTIVE',
      profile: {},
    })
  ).userId;
});

afterAll(async () => {
  const ventureIds = await ownVentureIds();
  const userIds = [studentOne, studentTwo, studentThree, facultyId, mentorId].filter(Boolean);

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

describe('the template', () => {
  it('carries every column and a filled-in example row', () => {
    // A template of bare headers makes the first import a guessing game about
    // date formats and which spellings of a status are accepted.
    const template = buildTemplate(ventureImport);
    const [header, example] = template.replace(/^﻿/, '').trim().split('\r\n');

    for (const column of ventureImport.columns) {
      expect(header).toContain(column.label);
    }

    expect(example).toContain('Kirana Connect');
  });
});

describe('validating before writing', () => {
  it('reports valid rows without creating anything', async () => {
    const file = csv(
      { rollNumber: roll(1), ventureName: 'Dry Run Venture' },
      { studentEmail: email('two'), ventureName: 'Second Dry Run' },
    );

    const outcome = await runImport(ventureImport, file, { dryRun: true });

    expect(outcome.validRows).toBe(2);
    expect(outcome.invalidRows).toBe(0);
    expect(outcome.createdRows).toBe(0);

    // The point of a dry run: nothing reached the database.
    expect(await ownVentureIds()).toHaveLength(0);
  });

  it('rejects a row that names no student at all', async () => {
    const outcome = await runImport(ventureImport, csv({ ventureName: 'Nobody' }), {
      dryRun: true,
    });

    expect(outcome.validRows).toBe(0);
    expect(outcome.results[0]!.errors.join(' ')).toMatch(/roll number or by email/i);
  });

  it('rejects a row with no venture name', async () => {
    const outcome = await runImport(ventureImport, csv({ rollNumber: roll(1) }), { dryRun: true });

    expect(outcome.validRows).toBe(0);
    expect(outcome.results[0]!.errors.join(' ')).toMatch(/venture name/i);
  });

  it('catches the same student twice in one file', async () => {
    // One venture per student, so the second row would fail on commit anyway —
    // but after the first had already been written, which is the state nobody
    // wants to unpick.
    const file = csv(
      { rollNumber: roll(1), ventureName: 'First' },
      { rollNumber: roll(1), ventureName: 'Second' },
    );

    const outcome = await runImport(ventureImport, file, { dryRun: true });

    expect(outcome.validRows).toBe(1);
    expect(outcome.results[1]!.errors.join(' ')).toMatch(/duplicate roll number/i);
  });

  it('accepts a status a person would type', async () => {
    const file = csv({ rollNumber: roll(1), ventureName: 'Held', status: 'On hold' });
    const outcome = await runImport(ventureImport, file, { dryRun: true });

    expect(outcome.validRows).toBe(1);
  });

  it('refuses a status that is not one of the four', async () => {
    const file = csv({ rollNumber: roll(1), ventureName: 'Odd', status: 'Paused' });
    const outcome = await runImport(ventureImport, file, { dryRun: true });

    expect(outcome.validRows).toBe(0);
    expect(outcome.results[0]!.errors.join(' ')).toMatch(/Active, On hold/i);
  });
});

describe('committing', () => {
  it('creates the venture, its reviewers and its activity records', async () => {
    const file = csv({
      rollNumber: roll(1),
      ventureName: `Imported Venture ${SUFFIX}`,
      industry: 'Retail technology',
      facultyEmail: email('faculty'),
      mentorEmail: email('mentor'),
      status: 'On hold',
    });

    const outcome = await runImport(ventureImport, file, { dryRun: false });

    expect(outcome.createdRows).toBe(1);
    expect(outcome.failedRows).toBe(0);

    const venture = await models.StudentVenture.findOne({ studentId: studentOne }).lean().exec();

    expect(venture).toBeTruthy();
    expect(venture!.ventureName).toBe(`Imported Venture ${SUFFIX}`);
    expect(venture!.industry).toBe('Retail technology');
    expect(venture!.status).toBe('ON_HOLD');
    expect(venture!.facultyId?.toString()).toBe(facultyId);
    expect(venture!.mentorId?.toString()).toBe(mentorId);

    // The same service call the form makes, so the activity records exist.
    const activities = await models.VentureActivity.countDocuments({ status: 'ACTIVE' }).exec();
    const records = await models.StudentVentureActivity.countDocuments({
      studentVentureId: venture!._id,
    }).exec();

    expect(records).toBe(activities);
  });

  it('refuses a student who already has a venture, without touching it', async () => {
    const file = csv({ rollNumber: roll(1), ventureName: 'Second Venture' });
    const outcome = await runImport(ventureImport, file, { dryRun: false });

    expect(outcome.createdRows).toBe(0);
    expect(outcome.failedRows).toBe(1);
    expect(outcome.results[0]!.errors.join(' ')).toMatch(/already has a venture/i);

    const venture = await models.StudentVenture.findOne({ studentId: studentOne }).lean().exec();
    expect(venture!.ventureName).toBe(`Imported Venture ${SUFFIX}`);
  });

  it('fails one row without abandoning the rest of the file', async () => {
    // A file assembled by hand will have a bad row in it. Aborting the batch
    // would mean re-uploading everything to fix one line.
    const file = csv(
      { rollNumber: 'NO-SUCH-ROLL', ventureName: 'Ghost' },
      { rollNumber: roll(2), ventureName: `Good Row ${SUFFIX}` },
    );

    const outcome = await runImport(ventureImport, file, { dryRun: false });

    expect(outcome.createdRows).toBe(1);
    expect(outcome.failedRows).toBe(1);
    expect(outcome.results[0]!.errors.join(' ')).toMatch(/no student has the roll number/i);

    const good = await models.StudentVenture.findOne({ studentId: studentTwo }).lean().exec();
    expect(good!.ventureName).toBe(`Good Row ${SUFFIX}`);
  });

  it('refuses a roll number and an email that point at different people', async () => {
    // The signature of a column shifted by one. Importing it would attach
    // ventures to the wrong students and say nothing.
    const file = csv({
      rollNumber: roll(3),
      studentEmail: email('one'),
      ventureName: 'Mismatched',
    });

    const outcome = await runImport(ventureImport, file, { dryRun: false });

    expect(outcome.failedRows).toBe(1);
    expect(outcome.results[0]!.errors.join(' ')).toMatch(/belongs to/i);

    const none = await models.StudentVenture.findOne({ studentId: studentThree }).lean().exec();
    expect(none).toBeNull();
  });

  it('refuses a reviewer whose account is the wrong role', async () => {
    // Assigning a mentor as the faculty reviewer would quietly break dual
    // review: the pair would look complete while one side could never sign.
    const file = csv({
      rollNumber: roll(3),
      ventureName: 'Wrong Reviewer',
      facultyEmail: email('mentor'),
    });

    const outcome = await runImport(ventureImport, file, { dryRun: false });

    expect(outcome.failedRows).toBe(1);
    expect(outcome.results[0]!.errors.join(' ')).toMatch(/cannot be assigned as the faculty/i);
    expect(
      await models.StudentVenture.findOne({ studentId: studentThree }).lean().exec(),
    ).toBeNull();
  });

  it('matches headers however they are capitalised or spaced', async () => {
    // Administrators retype these files in Excel; "roll_number" and "Roll
    // Number" are the same column to everyone except a strict parser.
    const file = ['roll_number,VENTURE NAME', `${roll(3)},Loose Headers ${SUFFIX}`].join('\r\n');

    const outcome = await runImport(ventureImport, file, { dryRun: false });

    expect(outcome.createdRows).toBe(1);

    const venture = await models.StudentVenture.findOne({ studentId: studentThree }).lean().exec();
    expect(venture!.ventureName).toBe(`Loose Headers ${SUFFIX}`);
    // Not stated in the file, so it takes the default rather than nothing.
    expect(venture!.status).toBe('ACTIVE');
  });
});
