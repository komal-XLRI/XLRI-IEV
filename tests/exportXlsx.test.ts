import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { toXlsx } from '@/lib/export/xlsx';
import { eraseRowType, type ExportDataset } from '@/lib/export/types';

/**
 * What an exported workbook promises its recipient.
 *
 * These files leave the system — they are forwarded, tabled at meetings and
 * opened months later — so the things tested here are the ones that make a
 * stray spreadsheet still answerable: whose report it is, what shaped it, and
 * a table that behaves like a table when somebody sorts it.
 */

interface Row {
  student: string;
  score: number | null;
  comment: string;
}

function dataset(overrides: Partial<ExportDataset<Row>> = {}): ExportDataset<Row> {
  return {
    meta: {
      title: 'Workshop feedback',
      subtitle: 'IP Law and Strategy',
      filters: [{ label: 'Workshop', value: 'IP Law and Strategy' }],
      sort: 'Submission time',
      generatedAt: new Date('2026-09-22T09:32:45Z'),
      generatedBy: 'IEV Administrator',
      fileBase: 'workshop-feedback',
    },
    columns: [
      { key: 'student', header: 'Student', value: (r) => r.student, width: 22 },
      {
        key: 'score',
        header: 'Q1 Overall quality',
        type: 'number',
        align: 'right',
        value: (r) => r.score,
        width: 12,
      },
      { key: 'comment', header: 'Q5 Key takeaway', value: (r) => r.comment, width: 50 },
    ],
    rows: [
      { student: 'Shreyas Tiwary', score: 5, comment: 'Great insights on brand strategy' },
      { student: 'Palisha Garg', score: 1, comment: '' },
    ],
    summary: [{ label: 'Responses', value: '2' }],
    ...overrides,
  };
}

async function build(source = dataset()) {
  const buffer = await toXlsx(eraseRowType(source));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return { workbook, sheet: workbook.worksheets[0]! };
}

/** The row a heading sits in, found the way a reader would: by reading it. */
function rowContaining(sheet: ExcelJS.Worksheet, text: string): number {
  let found = 0;
  sheet.eachRow((row, number) => {
    if (found) return;
    const values = (row.values as unknown[]).map((value) => String(value ?? ''));
    if (values.some((value) => value.includes(text))) found = number;
  });
  return found;
}

describe('an exported workbook', () => {
  it('carries the XLRI mark, so a forwarded file says whose it is', async () => {
    const { workbook, sheet } = await build();

    expect(sheet.getImages()).toHaveLength(1);
    expect(workbook.model.media?.[0]?.extension).toBe('png');
    expect(workbook.company).toBe('XLRI Delhi-NCR');
  });

  it('says what shaped it, without a row per filter', async () => {
    const { sheet } = await build();

    const shaping = rowContaining(sheet, 'Sorted by Submission time');
    expect(shaping).toBeGreaterThan(0);

    // Filters, sort and row count share one line: everything above the header
    // is frozen, so each preamble row costs the reader a row of screen.
    const line = String((sheet.getRow(shaping).values as unknown[]).find(Boolean));
    expect(line).toContain('Workshop: IP Law and Strategy');
    expect(line).toContain('2 rows');
  });

  it('names who generated it and when', async () => {
    const { sheet } = await build();
    const stamp = rowContaining(sheet, 'Generated 22 Sept 2026');

    expect(stamp).toBeGreaterThan(0);
    expect(String((sheet.getRow(stamp).values as unknown[]).find(Boolean))).toContain(
      'IEV Administrator',
    );
  });

  it('freezes the headings and filters the table, not the masthead', async () => {
    const { sheet } = await build();
    const header = rowContaining(sheet, 'Q1 Overall quality');

    // Narrowed by hand: the union of view types only carries ySplit on the
    // frozen member, and `state` having been asserted does not narrow it.
    const view = sheet.views[0] as Partial<ExcelJS.WorksheetViewFrozen> | undefined;
    expect(view?.state).toBe('frozen');
    expect(view?.ySplit).toBe(header);

    // The filter covers the headings and every data row, and nothing above.
    // Read back from the file it is a range string, which is what was written.
    expect(sheet.autoFilter).toBe(`A${header}:C${header + 2}`);

    // And the headings repeat when it is printed.
    expect(sheet.pageSetup.printTitlesRow).toBe(`${header}:${header}`);
  });

  it('keeps numbers numeric, so the recipient can total them', async () => {
    const { sheet } = await build();
    const header = rowContaining(sheet, 'Q1 Overall quality');

    expect(sheet.getRow(header + 1).getCell(2).value).toBe(5);
    expect(typeof sheet.getRow(header + 2).getCell(2).value).toBe('number');
  });

  it('bands alternate rows so a wide row stays readable across', async () => {
    const { sheet } = await build();
    const header = rowContaining(sheet, 'Q1 Overall quality');

    const first = sheet.getRow(header + 1).getCell(1).fill as ExcelJS.FillPattern | undefined;
    const second = sheet.getRow(header + 2).getCell(1).fill as ExcelJS.FillPattern | undefined;

    expect(first?.fgColor?.argb).toBeUndefined();
    expect(second?.fgColor?.argb).toBe('FFF8FAFC');
  });

  it('puts the summary below the table, where it cannot be sorted into it', async () => {
    const { sheet } = await build();

    const header = rowContaining(sheet, 'Q1 Overall quality');
    const summary = rowContaining(sheet, 'Summary');

    expect(summary).toBeGreaterThan(header + 2);
    expect(rowContaining(sheet, 'Responses')).toBeGreaterThan(summary);
  });

  it('survives a report with no rows at all', async () => {
    const { sheet } = await build(dataset({ rows: [], summary: [] }));

    expect(rowContaining(sheet, 'Workshop feedback')).toBeGreaterThan(0);
    // Nothing to filter, so no filter is claimed over an empty table.
    expect(sheet.autoFilter).toBeUndefined();
  });

  it('keeps a sheet name Excel will actually open', async () => {
    const { sheet } = await build(
      dataset({
        meta: { ...dataset().meta, title: 'Reviews: faculty / mentor [Q1] * everything else' },
      }),
    );

    expect(sheet.name.length).toBeLessThanOrEqual(31);
    expect(sheet.name).not.toMatch(/[:\\/?*[\]]/);
  });
});
