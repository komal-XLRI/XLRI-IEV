/**
 * Reads a stage feedback spreadsheet into one entry per student row.
 *
 * The sheet is whatever the programme office keeps — the columns are mentor
 * questions, scores and comments that differ from stage to stage — so nothing
 * is assumed about it except that some column identifies the student. A roll
 * number column is preferred; an email column is the fallback. Every other
 * column is carried through as-is, heading and value, for the student to read.
 */

export const MAX_FEEDBACK_SHEET_ROWS = 2000;
const MAX_COLUMNS = 80;
const MAX_VALUE_LENGTH = 5000;
/** How far down a title block may push the heading row. */
const HEADER_SEARCH_ROWS = 10;

export interface FeedbackSheetRow {
  /** 1-based row number in the sheet, as the administrator sees it. */
  line: number;
  rollNumber: string | null;
  email: string | null;
  fields: Array<{ label: string; value: string }>;
}

export interface ParsedFeedbackSheet {
  /** The heading rows were matched on, for the summary. */
  matchedOn: string;
  rows: FeedbackSheetRow[];
}

export class FeedbackSheetFormatError extends Error {}

function normalise(heading: string): string {
  return heading.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isRollHeading(heading: string): boolean {
  const key = normalise(heading);
  return (
    key.includes('roll') ||
    key === 'rollno' ||
    key.includes('enrolment') ||
    key.includes('enrollment') ||
    key === 'regno' ||
    key.includes('registrationnumber')
  );
}

function isEmailHeading(heading: string): boolean {
  const key = normalise(heading);
  return key.includes('email') || key === 'mail' || key === 'mailid';
}

/**
 * Columns that only say who the row is about. The student already knows their
 * own name and roll number, so these are left out of what they are shown.
 */
function isIdentityHeading(heading: string): boolean {
  const key = normalise(heading);
  return (
    isRollHeading(heading) ||
    isEmailHeading(heading) ||
    [
      'name',
      'studentname',
      'fullname',
      'nameofthestudent',
      'srno',
      'sno',
      'slno',
      'serialno',
    ].includes(key)
  );
}

export function parseFeedbackSheet(grid: string[][]): ParsedFeedbackSheet {
  const headerIndex = grid
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex((row) => row.some((cell) => isRollHeading(cell) || isEmailHeading(cell)));

  if (headerIndex === -1) {
    throw new FeedbackSheetFormatError(
      'Could not find a column identifying the student. Add a "Roll Number" or "Email" column heading.',
    );
  }

  const header = grid[headerIndex]!.slice(0, MAX_COLUMNS);
  const rollColumn = header.findIndex(isRollHeading);
  const emailColumn = header.findIndex(isEmailHeading);

  const labels = header.map((cell, index) => cell.trim() || `Column ${index + 1}`);
  const shown = labels
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => !isIdentityHeading(label));

  const rows: FeedbackSheetRow[] = [];

  grid.slice(headerIndex + 1).forEach((cells, offset) => {
    if (cells.every((cell) => cell.trim() === '')) return;

    const read = (index: number) => (index >= 0 ? (cells[index] ?? '').trim() : '');
    const rollNumber = read(rollColumn).toUpperCase() || null;
    const email = read(emailColumn).toLowerCase() || null;

    rows.push({
      line: headerIndex + offset + 2,
      rollNumber,
      email,
      fields: shown
        .map(({ label, index }) => ({ label, value: read(index).slice(0, MAX_VALUE_LENGTH) }))
        .filter((field) => field.value !== ''),
    });
  });

  if (rows.length === 0) {
    throw new FeedbackSheetFormatError(
      'The sheet has headings but no rows of feedback under them.',
    );
  }
  if (rows.length > MAX_FEEDBACK_SHEET_ROWS) {
    throw new FeedbackSheetFormatError(
      `The sheet has ${rows.length} rows; the limit is ${MAX_FEEDBACK_SHEET_ROWS}. Split it into smaller sheets.`,
    );
  }

  return {
    matchedOn: labels[rollColumn >= 0 ? rollColumn : emailColumn]!,
    rows,
  };
}
