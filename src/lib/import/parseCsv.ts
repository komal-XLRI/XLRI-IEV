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
  /**
   * The heading each field was actually read from.
   *
   * Which matters when the heading is content rather than plumbing: a survey
   * export heads its columns with the questions students were asked, and those
   * questions are worth keeping. A field no column supplied is absent.
   */
  matched: Record<string, string>;
  /** One record per row, keyed by header. Extra columns are ignored. */
  rows: Array<Record<string, string>>;
  /** 1-based line number in the source, for error messages. */
  lineNumbers: number[];
}

/**
 * Guesses the separator a pasted block uses.
 *
 * Copying a range out of Excel or Google Sheets puts tabs on the clipboard,
 * not commas, and an administrator pasting that into a box labelled CSV has
 * done nothing wrong. Only the header line is counted, deliberately: a comma
 * inside a quoted address further down should not outvote the real separator.
 */
export type Delimiter = ',' | '\t' | ';';

export function sniffDelimiter(input: string): Delimiter {
  const firstLine = input.replace(/^﻿/, '').split(/\r?\n/, 1)[0] ?? '';

  const count = (pattern: RegExp) => (firstLine.match(pattern) ?? []).length;

  const comma = count(/,/g);
  const tab = count(/\t/g);
  const semicolon = count(/;/g);

  // Commas win ties: it is the documented format and what the template uses.
  if (tab > comma && tab >= semicolon) return '\t';
  if (semicolon > comma) return ';';
  return ',';
}

export function parseCsvRows(input: string, delimiter: string = ','): string[][] {
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

    if (char === delimiter) {
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
/**
 * A field the import wants, and the heading a person would write for it.
 *
 * Both are matched, because they are routinely different words: the venture
 * template heads its `fundingStatus` column "Funding" and its
 * `problemStatement` column "Problem". Matching on the field name alone meant
 * those columns were read as absent and silently dropped — from files this
 * system had produced itself.
 */
export type ExpectedColumn =
  | string
  | {
      field: string;
      label?: string;
      /**
       * Headings this column is also known by, matched exactly.
       *
       * For a file this system did not design the template for — a Google Form
       * export, say — where the heading is the question a student was asked.
       */
      aliases?: string[];
      /**
       * Headings this column claims by their opening words.
       *
       * A survey question makes a terrible column name: it is a whole sentence,
       * it gets reworded between runs, and a spreadsheet truncates it on sight.
       * What stays put is how it is numbered, so a prefix of "1)" claims
       * "1) How would you rate the overall quality of the workshop?" and goes on
       * matching it after somebody rewrites the wording.
       *
       * Tried only after every exact match has been made, so a precise heading
       * can never lose its column to a prefix.
       */
      matchPrefix?: string[];
    };

interface Expectation {
  field: string;
  aliases: string[];
  prefixes: string[];
}

function expectationFor(entry: ExpectedColumn): Expectation {
  if (typeof entry === 'string') return { field: entry, aliases: [entry], prefixes: [] };

  return {
    field: entry.field,
    aliases: [entry.field, ...(entry.label ? [entry.label] : []), ...(entry.aliases ?? [])],
    prefixes: entry.matchPrefix ?? [],
  };
}

export function parseCsv(input: string, expected: ExpectedColumn[]): ParsedCsv {
  return parseGrid(parseCsvRows(input, sniffDelimiter(input)), expected);
}

/**
 * Maps an already-split grid onto the expected fields.
 *
 * Separated from the CSV reader so a spreadsheet can use the same path: an
 * .xlsx worksheet arrives as rows of cells having never been text, and header
 * matching, blank-row skipping and line numbering should not be written twice.
 */
export function parseGrid(raw: string[][], expected: ExpectedColumn[]): ParsedCsv {
  if (raw.length === 0) {
    return { headers: [], matched: {}, rows: [], lineNumbers: [] };
  }

  const headerRow = raw[0]!.map((cell) => cell.replace(/^\t/, '').trim());
  const normalised = headerRow.map(normaliseHeader);
  const wanted = expected.map(expectationFor);

  // Map each expected field to the column index that supplies it. The field
  // name is tried first, so a machine-written header keeps winning over a
  // label that happens to collide with it.
  const columnFor = new Map<string, number>();
  for (const { field, aliases } of wanted) {
    for (const alias of aliases) {
      const index = normalised.indexOf(normaliseHeader(alias));
      if (index !== -1) {
        columnFor.set(field, index);
        break;
      }
    }
  }

  // Second pass, for fields no heading matched outright. A prefix is a weaker
  // claim than a name, so it only ever picks up a column nothing else took —
  // and it takes the first such column, because two questions numbered "1)"
  // is a broken file, not an ambiguity worth guessing at.
  const taken = new Set(columnFor.values());
  for (const { field, prefixes } of wanted) {
    if (columnFor.has(field) || prefixes.length === 0) continue;

    for (const prefix of prefixes) {
      const key = normaliseHeader(prefix);
      if (key === '') continue;

      const index = normalised.findIndex(
        (header, at) => !taken.has(at) && header.startsWith(key),
      );
      if (index !== -1) {
        columnFor.set(field, index);
        taken.add(index);
        break;
      }
    }
  }

  const rows: Array<Record<string, string>> = [];
  const lineNumbers: number[] = [];

  for (let i = 1; i < raw.length; i += 1) {
    const cells = raw[i]!;

    // Skip rows that are entirely blank.
    if (cells.every((cell) => cell.trim() === '')) continue;

    const record: Record<string, string> = {};
    for (const { field } of wanted) {
      const index = columnFor.get(field);
      const value = index === undefined ? '' : (cells[index] ?? '');
      record[field] = value.replace(/^\t/, '').trim();
    }

    rows.push(record);
    lineNumbers.push(i + 1);
  }

  const matched: Record<string, string> = {};
  for (const [field, index] of columnFor) {
    const heading = headerRow[index];
    if (heading) matched[field] = heading;
  }

  return { headers: headerRow, matched, rows, lineNumbers };
}

/** Detects whether a header row is present at all. */
export function hasRecognisableHeader(input: string, expected: ExpectedColumn[]): boolean {
  const raw = parseCsvRows(input, sniffDelimiter(input));
  if (raw.length === 0) return false;

  const normalised = raw[0]!.map(normaliseHeader);
  return expected
    .map(expectationFor)
    .some(({ aliases }) => aliases.some((alias) => normalised.includes(normaliseHeader(alias))));
}
