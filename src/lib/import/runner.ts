import 'server-only';
import { ZodError } from 'zod';
import { ValidationError } from '@/lib/errors';
import { normaliseHeader, parseCsv, parseGrid } from './parseCsv';
import type { ImportContext, ImportOutcome, ImportRowResult, ImportSpec } from './types';

export const MAX_IMPORT_ROWS = 2_000;

/**
 * Runs an import in two phases.
 *
 * A dry run validates every row and reports per-row errors without writing
 * anything, so an administrator sees exactly what a 500-row file will do
 * before committing it. The commit pass then writes row by row: one bad row
 * fails alone rather than aborting the batch, which matters when the file was
 * assembled by hand.
 */
export async function runImport<Parsed>(
  spec: ImportSpec<Parsed>,
  /**
   * CSV text, or an already-split grid from a spreadsheet.
   *
   * Both arrive at the same validation and commit passes on purpose: an
   * imported row must mean the same thing whichever file it came out of.
   */
  source: string | string[][],
  options: { dryRun: boolean; context?: ImportContext },
): Promise<ImportOutcome> {
  // Labels ride along with the field names: the heading a person writes is the
  // label ("Funding"), not the field ("fundingStatus"), and matching only the
  // latter dropped those columns without a word.
  const fields = spec.columns.map((column) => ({
    field: column.field,
    label: column.label,
    aliases: column.aliases,
    matchPrefix: column.matchPrefix,
  }));
  const { headers, matched, rows, lineNumbers } =
    typeof source === 'string' ? parseCsv(source, fields) : parseGrid(source, fields);

  // Context is optional so the specs that read nothing but their own columns —
  // most of them — are called the way they always were. A spec that does need
  // it validates it like any other input, so an empty one fails its rows with a
  // message rather than writing something half-addressed.
  const context: ImportContext = {
    actorId: '',
    params: {},
    ...(options.context ?? {}),
    // Taken from the file just parsed, never from the caller: the headings
    // belong to this read and nothing else could know them.
    headings: matched,
  };

  const fileErrors: string[] = [];

  if (rows.length === 0) {
    fileErrors.push('No data rows found. Include a header row followed by at least one record.');
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    fileErrors.push(
      `This file has ${rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`,
    );
  }

  // A missing required column is a file-level problem, not a per-row one. The
  // header is compared the same forgiving way the parser matched it, so a file
  // headed "roll_number" is not reported as missing "Roll Number".
  const present = new Set(headers.map(normaliseHeader));
  for (const column of spec.columns) {
    if (!column.required) continue;
    const matched = rows.some((row) => row[column.field] !== '');
    const named =
      present.has(normaliseHeader(column.field)) || present.has(normaliseHeader(column.label));
    if (!matched && !named) {
      fileErrors.push(`Required column "${column.label}" is missing or empty for every row.`);
    }
  }

  if (fileErrors.length > 0) {
    return {
      datasetKey: spec.key,
      dryRun: options.dryRun,
      totalRows: rows.length,
      validRows: 0,
      invalidRows: rows.length,
      createdRows: 0,
      updatedRows: 0,
      failedRows: 0,
      results: [],
      fileErrors,
    };
  }

  // ---- Phase 1: validate every row -------------------------------------
  const results: ImportRowResult[] = [];
  const parsed: Array<{ index: number; value: Parsed }> = [];

  rows.forEach((row, index) => {
    const line = lineNumbers[index] ?? index + 2;
    const outcome = spec.schema.safeParse(row);

    if (outcome.success) {
      parsed.push({ index, value: outcome.data });
      results.push({ line, status: 'ok', values: row, errors: [], notes: [] });
    } else {
      results.push({
        line,
        status: 'error',
        values: row,
        errors: formatIssues(outcome.error),
        notes: [],
      });
    }
  });

  // ---- Cross-row checks (duplicates within the file) --------------------
  if (spec.validateBatch) {
    for (const problem of spec.validateBatch(parsed.map((entry) => entry.value))) {
      const target = parsed[problem.index];
      if (!target) continue;
      const result = results[target.index];
      if (!result) continue;
      result.status = 'error';
      result.errors.push(problem.message);
    }
  }

  const validEntries = parsed.filter((entry) => results[entry.index]?.status === 'ok');

  const invalidRows = results.filter((result) => result.status === 'error').length;

  if (options.dryRun) {
    // Ask the spec what each row would do, so a row that is about to replace
    // an existing record says so while there is still time to stop.
    let plannedUpdates = 0;

    if (spec.preview) {
      for (const entry of validEntries) {
        const result = results[entry.index];
        if (!result) continue;

        try {
          const plan = await spec.preview(entry.value, context);
          if (plan?.action !== 'updated') continue;

          plannedUpdates += 1;
          result.notes.push(plan.note ?? 'Will replace an existing record');
        } catch (error) {
          // A preview that cannot answer is a courtesy lost, and the commit
          // pass will report the real problem against the row. But a spec that
          // says outright that this row is unwritable — a roll number matching
          // no student, say — is reporting the very thing the preview exists
          // to find, and swallowing it would let somebody confirm an import
          // that was never going to write those rows.
          if (error instanceof ValidationError) {
            result.status = 'error';
            result.errors.push(error.message);
          }
        }
      }
    }

    const stillValid = results.filter((result) => result.status === 'ok').length;

    return {
      datasetKey: spec.key,
      dryRun: true,
      totalRows: rows.length,
      validRows: stillValid,
      invalidRows: rows.length - stillValid,
      createdRows: 0,
      updatedRows: plannedUpdates,
      failedRows: 0,
      results,
      fileErrors: [],
    };
  }

  // ---- Phase 2: commit the valid rows ----------------------------------
  let createdRows = 0;
  let updatedRows = 0;
  let failedRows = 0;

  for (const entry of validEntries) {
    const result = results[entry.index];
    if (!result) continue;

    try {
      // A spec that only ever creates returns nothing, so undefined reads as
      // 'created' rather than forcing five create-only specs to say so.
      const action = (await spec.commit(entry.value, context)) ?? 'created';

      if (action === 'updated') {
        result.status = 'updated';
        updatedRows += 1;
      } else {
        result.status = 'created';
        createdRows += 1;
      }
    } catch (error) {
      result.status = 'failed';
      result.errors.push(error instanceof Error ? error.message : 'Unknown error');
      failedRows += 1;
    }
  }

  return {
    datasetKey: spec.key,
    dryRun: false,
    totalRows: rows.length,
    validRows: validEntries.length,
    invalidRows,
    createdRows,
    updatedRows,
    failedRows,
    results,
    fileErrors: [],
  };
}

function formatIssues(error: ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}

/** Blank, downloadable CSV template with the header row and one example. */
export function buildTemplate(spec: ImportSpec<unknown>): string {
  const escape = (value: string) =>
    /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

  const header = spec.columns.map((column) => escape(column.label)).join(',');
  const example = spec.columns.map((column) => escape(column.example)).join(',');

  return `﻿${header}\r\n${example}\r\n`;
}

/**
 * The same template as a workbook.
 *
 * Most people will fill this in rather than the CSV, so it does the things a
 * blank grid cannot: required columns are marked, the hints ride along as cell
 * comments, and every column is text-formatted — which is what stops Excel
 * turning a roll number into 1.02e+11 or a code like "V01" into a date.
 */
export async function buildTemplateWorkbook(spec: ImportSpec<unknown>): Promise<Buffer> {
  const ExcelJS = (await import('exceljs')).default;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'IEV Activity Tracker';

  const sheet = workbook.addWorksheet(spec.title.slice(0, 31));

  sheet.columns = spec.columns.map((column) => ({
    header: column.required ? `${column.label} *` : column.label,
    key: column.field,
    width: Math.max(14, Math.min(40, column.label.length + 8)),
    style: { numFmt: '@' },
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  spec.columns.forEach((column, index) => {
    if (!column.hint) return;
    header.getCell(index + 1).note = column.hint;
  });

  const example = sheet.addRow(
    Object.fromEntries(spec.columns.map((column) => [column.field, column.example])),
  );
  example.font = { italic: true, color: { argb: 'FF64748B' } };

  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
