/**
 * Reads a stage feedback spreadsheet into one entry per row.
 *
 * The sheet is whatever the programme office keeps — usually a feedback form
 * export, one row per evaluator per student, with the questions as headings —
 * so nothing is assumed about it except that some column says which student
 * the row is about. That can be a roll number, a student email, or the
 * student's name (often written "Name - Startup"). Every other column is
 * carried through as-is, heading and value, for the student to read.
 *
 * A plain "Email Address" column next to a student name column is the
 * evaluator's — the form records who filled it in — so it is never used to
 * match a student when a name column is there to use instead.
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
  /** Only ever a student's address — never the evaluator's. */
  email: string | null;
  /** The student column as written, e.g. "Kushagra Garg - Dhanush". */
  studentName: string | null;
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

/** Headings about the person giving feedback, not the one receiving it. */
const EVALUATOR_WORDS = [
  'evaluator',
  'mentor',
  'faculty',
  'reviewer',
  'judge',
  'assessor',
  'panel',
];

function isEvaluatorHeading(heading: string): boolean {
  const key = normalise(heading);
  return EVALUATOR_WORDS.some((word) => key.includes(word));
}

function isRollHeading(heading: string): boolean {
  const key = normalise(heading);
  return (
    key.includes('roll') ||
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

function isStudentEmailHeading(heading: string): boolean {
  return isEmailHeading(heading) && normalise(heading).includes('student');
}

function isStudentNameHeading(heading: string): boolean {
  if (isEvaluatorHeading(heading) || isEmailHeading(heading) || isRollHeading(heading)) {
    return false;
  }
  const key = normalise(heading);
  return (
    key.includes('student') ||
    key.includes('participant') ||
    ['name', 'names', 'fullname', 'nameofthestudent'].includes(key)
  );
}

/**
 * Columns that only say who the row is about, or who sent the form. The
 * student already knows their own name and roll number, and an evaluator's
 * email address is not theirs to hand out, so these are left out of what the
 * student is shown.
 */
function isIdentityHeading(heading: string): boolean {
  return (
    isRollHeading(heading) ||
    isEmailHeading(heading) ||
    isStudentNameHeading(heading) ||
    ['srno', 'sno', 'slno', 'serialno'].includes(normalise(heading))
  );
}

function isMatchingHeading(heading: string): boolean {
  return isRollHeading(heading) || isEmailHeading(heading) || isStudentNameHeading(heading);
}

export function parseFeedbackSheet(grid: string[][]): ParsedFeedbackSheet {
  const headerIndex = grid
    .slice(0, HEADER_SEARCH_ROWS)
    .findIndex((row) => row.some(isMatchingHeading));

  if (headerIndex === -1) {
    throw new FeedbackSheetFormatError(
      'Could not find a column identifying the student. Add a "Student Name", "Roll Number" or "Student Email" column heading.',
    );
  }

  const header = grid[headerIndex]!.slice(0, MAX_COLUMNS);
  const rollColumn = header.findIndex(isRollHeading);
  const nameColumn = header.findIndex(isStudentNameHeading);
  // A generic email column only identifies the student when nothing else does.
  const studentEmailColumn = header.findIndex(isStudentEmailHeading);
  const emailColumn =
    studentEmailColumn >= 0
      ? studentEmailColumn
      : rollColumn < 0 && nameColumn < 0
        ? header.findIndex(isEmailHeading)
        : -1;

  if (rollColumn < 0 && nameColumn < 0 && emailColumn < 0) {
    throw new FeedbackSheetFormatError(
      'Could not find a column identifying the student. Add a "Student Name", "Roll Number" or "Student Email" column heading.',
    );
  }

  const labels = header.map((cell, index) => cell.trim() || `Column ${index + 1}`);
  const shown = labels
    .map((label, index) => ({ label, index }))
    .filter(({ label }) => !isIdentityHeading(label));

  const rows: FeedbackSheetRow[] = [];

  grid.slice(headerIndex + 1).forEach((cells, offset) => {
    if (cells.every((cell) => cell.trim() === '')) return;

    const read = (index: number) => (index >= 0 ? (cells[index] ?? '').trim() : '');

    rows.push({
      line: headerIndex + offset + 2,
      rollNumber: read(rollColumn).toUpperCase() || null,
      email: read(emailColumn).toLowerCase() || null,
      studentName: read(nameColumn) || null,
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

  const matchedOn = [rollColumn, emailColumn, nameColumn]
    .filter((index) => index >= 0)
    .map((index) => labels[index]!);

  return { matchedOn: matchedOn.join(' / '), rows };
}

/**
 * Splits a student cell like "Kushagra Garg - Dhanush" into the person and the
 * startup. Only a separator with spaces around it counts, so a hyphenated name
 * ("Mary-Jane") stays whole.
 */
export function splitStudentCell(cell: string): { name: string; venture: string | null } {
  const match =
    /^(.*?)\s+[-–—|:]\s+(.+)$/.exec(cell.trim()) ?? /^(.*?)\s*\((.+)\)\s*$/.exec(cell.trim());
  if (!match) return { name: cell.trim(), venture: null };
  return { name: match[1]!.trim(), venture: match[2]!.trim() || null };
}

/** Name comparison that ignores case, punctuation and spacing. */
export function nameKey(value: string): string {
  return value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
