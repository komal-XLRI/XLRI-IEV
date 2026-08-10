import 'server-only';
import { ZodError } from 'zod';
import { parseCsv } from './parseCsv';
import type { ImportOutcome, ImportRowResult, ImportSpec } from './types';

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
  csv: string,
  options: { dryRun: boolean },
): Promise<ImportOutcome> {
  const fields = spec.columns.map((column) => column.field);
  const { headers, rows, lineNumbers } = parseCsv(csv, fields);

  const fileErrors: string[] = [];

  if (rows.length === 0) {
    fileErrors.push('No data rows found. Include a header row followed by at least one record.');
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    fileErrors.push(
      `This file has ${rows.length} rows. Import at most ${MAX_IMPORT_ROWS} at a time.`,
    );
  }

  // A missing required column is a file-level problem, not a per-row one.
  const present = new Set(headers.map((header) => header.trim().toLowerCase()));
  for (const column of spec.columns) {
    if (!column.required) continue;
    const matched = rows.some((row) => row[column.field] !== '');
    if (!matched && !present.has(column.label.toLowerCase())) {
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
      results.push({ line, status: 'ok', values: row, errors: [] });
    } else {
      results.push({
        line,
        status: 'error',
        values: row,
        errors: formatIssues(outcome.error),
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
    return {
      datasetKey: spec.key,
      dryRun: true,
      totalRows: rows.length,
      validRows: validEntries.length,
      invalidRows,
      createdRows: 0,
      failedRows: 0,
      results,
      fileErrors: [],
    };
  }

  // ---- Phase 2: commit the valid rows ----------------------------------
  let createdRows = 0;
  let failedRows = 0;

  for (const entry of validEntries) {
    const result = results[entry.index];
    if (!result) continue;

    try {
      await spec.commit(entry.value);
      result.status = 'created';
      createdRows += 1;
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
