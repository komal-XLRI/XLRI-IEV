/**
 * RFC 4180 CSV reader.
 *
 * Written by hand rather than pulled from a package because the input is
 * pasted or uploaded by administrators: it has to survive quoted fields with
 * embedded commas and newlines, a UTF-8 BOM from Excel, CRLF endings, and the
 * leading-tab guard our own exporter adds to formula-looking cells — so that a
 * file exported from this system can be re-imported unchanged.
 */

export interface ParsedCsv {
  headers: string[];
  /** One record per row, keyed by header. Extra columns are ignored. */
  rows: Array<Record<string, string>>;
  /** 1-based line number in the source, for error messages. */
  lineNumbers: number[];
}

export function parseCsvRows(input: string): string[][] {
  const text = input.replace(/^﻿/, '');
  const rows: string[][] = [];

  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let index = 0;

  const endField = () => {
    row.push(field);
    field = '';
  };

  const endRow = () => {
    endField();
    // A trailing newline should not produce a spurious empty record.
    if (row.length > 1 || row[0] !== '') rows.push(row);
    row = [];
  };

  while (index < text.length) {
    const char = text[index]!;

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"' && field === '') {
      inQuotes = true;
      index += 1;
      continue;
    }

    if (char === ',') {
      endField();
      index += 1;
      continue;
    }

    if (char === '\r') {
      // Handle CRLF and a lone CR.
      if (text[index + 1] === '\n') index += 1;
      endRow();
      index += 1;
      continue;
    }

    if (char === '\n') {
      endRow();
      index += 1;
      continue;
    }

    field += char;
    index += 1;
  }

  if (field !== '' || row.length > 0) endRow();

  return rows;
}

/** Normalises a header for matching: lowercase, alphanumerics only. */
export function normaliseHeader(header: string): string {
  return header
    .replace(/^\t/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Parses to records keyed by column.
 *
 * Header matching is forgiving — "Roll Number", "rollNumber" and "roll_number"
 * all resolve to the same field, because administrators build these files in
 * Excel by hand.
 */
export function parseCsv(input: string, expected: string[]): ParsedCsv {
  const raw = parseCsvRows(input);

  if (raw.length === 0) {
    return { headers: [], rows: [], lineNumbers: [] };
  }

  const headerRow = raw[0]!.map((cell) => cell.replace(/^\t/, '').trim());
  const normalised = headerRow.map(normaliseHeader);

  // Map each expected field to the column index that supplies it.
  const columnFor = new Map<string, number>();
  for (const field of expected) {
    const index = normalised.indexOf(normaliseHeader(field));
    if (index !== -1) columnFor.set(field, index);
  }

  const rows: Array<Record<string, string>> = [];
  const lineNumbers: number[] = [];

  for (let i = 1; i < raw.length; i += 1) {
    const cells = raw[i]!;

    // Skip rows that are entirely blank.
    if (cells.every((cell) => cell.trim() === '')) continue;

    const record: Record<string, string> = {};
    for (const field of expected) {
      const index = columnFor.get(field);
      const value = index === undefined ? '' : (cells[index] ?? '');
      record[field] = value.replace(/^\t/, '').trim();
    }

    rows.push(record);
    lineNumbers.push(i + 1);
  }

  return { headers: headerRow, rows, lineNumbers };
}

/** Detects whether a header row is present at all. */
export function hasRecognisableHeader(input: string, expected: string[]): boolean {
  const raw = parseCsvRows(input);
  if (raw.length === 0) return false;

  const normalised = raw[0]!.map(normaliseHeader);
  return expected.some((field) => normalised.includes(normaliseHeader(field)));
}
