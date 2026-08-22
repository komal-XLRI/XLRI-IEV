/**
 * Importing a real spreadsheet, end to end, against a real MongoDB.
 *
 * The unit specs prove a workbook becomes a grid. This proves the grid reaches
 * the same validation and commit passes a CSV does — an imported row has to
 * mean the same thing whichever file it came out of, or the preview stops
 * being a promise about what will happen.
 *
 * Fixtures are created here and removed in `afterAll`.
 *
 * Requires MONGODB_URI. Run with `npm run test:integration`.
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
const { ventureImport } = await import('@/services/import/specs');
const { buildTemplateWorkbook, runImport } = await import('@/lib/import/runner');
const { readImportUpload } = await import('@/lib/import/readUpload');

const SUFFIX = `xls-${Date.now()}`;
const roll = (n: number) => `XLS${n}-${SUFFIX}`.toUpperCase();

let studentOne: string;
let studentTwo: string;

/** Builds a workbook the way an administrator's own file would look. */
async function sheet(rows: unknown[][]): Promise<Uint8Array> {
  const book = new ExcelJS.Workbook();
  const worksheet = book.addWorksheet('Ventures');
  rows.forEach((row) => worksheet.addRow(row));
  return new Uint8Array(await book.xlsx.writeBuffer());
}

async function ownVentureIds(): Promise<string[]> {
  const ventures = await models.StudentVenture.find({
    studentId: { $in: [studentOne, studentTwo].filter(Boolean) },
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
      name: 'Spreadsheet One',
      email: `one.${SUFFIX}@example.test`,
      status: 'ACTIVE',
      profile: { rollNumber: roll(1), batch: '2026' },
    })
  ).userId;

  studentTwo = (
    await createUser({
      role: 'STUDENT',
      name: 'Spreadsheet Two',
      email: `two.${SUFFIX}@example.test`,
      status: 'ACTIVE',
      profile: { rollNumber: roll(2), batch: '2026' },
    })
  ).userId;
});

afterAll(async () => {
  const ventureIds = await ownVentureIds();
  const userIds = [studentOne, studentTwo].filter(Boolean);

  await models.StudentVentureActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentSupportActivity.deleteMany({ studentVentureId: { $in: ventureIds } }).exec();
  await models.StudentVenture.deleteMany({ _id: { $in: ventureIds } }).exec();
  await models.StudentProfile.deleteMany({ userId: { $in: userIds } }).exec();
  await models.User.deleteMany({ _id: { $in: userIds } }).exec();

  await disconnectFromDatabase();
});

describe('the Excel template', () => {
  it('reads back as the columns it promises', async () => {
    // The template and the reader are two halves of one contract. If the
    // header it writes is not the header the parser recognises, the first
    // import anybody tries fails on a file this system produced itself.
    const workbook = await buildTemplateWorkbook(ventureImport);
    const { grid, format } = await readImportUpload(new Uint8Array(workbook));

    expect(format).toBe('xlsx');

    const header = grid[0]!.join(' ');
    for (const column of ventureImport.columns) {
      expect(header).toContain(column.label);
    }
  });

  it('marks the required columns', async () => {
    const workbook = await buildTemplateWorkbook(ventureImport);
    const { grid } = await readImportUpload(new Uint8Array(workbook));

    const required = ventureImport.columns.filter((column) => column.required);
    for (const column of required) {
      expect(grid[0]!).toContain(`${column.label} *`);
    }
  });

  it('validates cleanly once filled in, asterisks and all', async () => {
    // The asterisk is decoration: header matching strips everything that is
    // not a letter or a digit, so "Venture Name *" is still ventureName.
    const workbook = await buildTemplateWorkbook(ventureImport);
    const { grid } = await readImportUpload(new Uint8Array(workbook));

    const filled = [grid[0]!, grid[0]!.map(() => '')];
    const rollColumn = grid[0]!.findIndex((cell) => cell.startsWith('Roll Number'));
    const nameColumn = grid[0]!.findIndex((cell) => cell.startsWith('Venture Name'));
    filled[1]![rollColumn] = roll(1);
    filled[1]![nameColumn] = `Template Venture ${SUFFIX}`;

    const outcome = await runImport(ventureImport, filled, { dryRun: true });
    expect(outcome.validRows).toBe(1);
    expect(outcome.fileErrors).toEqual([]);
  });
});

describe('importing a spreadsheet', () => {
  it('validates a workbook without writing anything', async () => {
    const file = await sheet([
      ['Roll Number', 'Venture Name', 'Industry'],
      [roll(1), 'Sheet Venture One', 'Retail technology'],
      [roll(2), 'Sheet Venture Two', 'Logistics'],
    ]);

    const { grid } = await readImportUpload(file);
    const outcome = await runImport(ventureImport, grid, { dryRun: true });

    expect(outcome.validRows).toBe(2);
    expect(outcome.invalidRows).toBe(0);
    expect(await ownVentureIds()).toHaveLength(0);
  });

  it('commits a workbook the same way it commits a CSV', async () => {
    const file = await sheet([
      ['Roll Number', 'Venture Name', 'Industry', 'Status'],
      [roll(1), `From Excel ${SUFFIX}`, 'Retail technology', 'On hold'],
    ]);

    const { grid } = await readImportUpload(file);
    const outcome = await runImport(ventureImport, grid, { dryRun: false });

    expect(outcome.createdRows).toBe(1);

    const venture = await models.StudentVenture.findOne({ studentId: studentOne }).lean().exec();
    expect(venture!.ventureName).toBe(`From Excel ${SUFFIX}`);
    expect(venture!.status).toBe('ON_HOLD');

    // Same service call as every other path, so the activity records exist.
    const activities = await models.VentureActivity.countDocuments({ status: 'ACTIVE' }).exec();
    const records = await models.StudentVentureActivity.countDocuments({
      studentVentureId: venture!._id,
    }).exec();
    expect(records).toBe(activities);
  });

  it('reports a bad row against the spreadsheet line it is on', async () => {
    // Numbering has to survive the change of format, or an error message sends
    // somebody to the wrong row of their own file.
    const file = await sheet([
      ['Roll Number', 'Venture Name'],
      [roll(2), 'Fine'],
      ['NO-SUCH-ROLL', 'Broken'],
    ]);

    const { grid } = await readImportUpload(file);
    const outcome = await runImport(ventureImport, grid, { dryRun: false });

    expect(outcome.createdRows).toBe(1);
    expect(outcome.failedRows).toBe(1);

    const failed = outcome.results.find((result) => result.status === 'failed')!;
    expect(failed.line).toBe(3);
  });

  it('accepts a tab-separated paste', async () => {
    const pasted = ['Roll Number\tVenture Name', `${roll(1)}\tPasted from Excel`].join('\n');

    const outcome = await runImport(ventureImport, pasted, { dryRun: true });
    expect(outcome.validRows).toBe(1);
  });
});
