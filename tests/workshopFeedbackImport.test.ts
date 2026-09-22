import { describe, expect, it } from 'vitest';
import { parseGrid } from '@/lib/import/parseCsv';
import { workshopFeedbackImport } from '@/services/import/specs';

/**
 * Reading a feedback form export.
 *
 * The file this was built against is a Google Form export: the headings are
 * the questions students were asked, written out in full, and they will be
 * reworded the next time somebody edits the form. So the tests here are about
 * the two things that make such a file readable at all — columns claimed by
 * their numbering rather than their wording, and rows that survive a student
 * skipping a question — rather than about the happy path.
 */

/** The real export's headings, wording and all. */
const HEADERS = [
  'Timestamp',
  'Email Address',
  'Name',
  'Roll No.',
  '1) How would you rate the overall quality and delivery of the session?',
  '2) How effectively did the session help you understand the topic?',
  "3) How would you rate the speaker's knowledge and command over the subject?",
  '4) How relevant and applicable were the insights shared in the session?',
  '5) What was your key takeaway from the session?',
];

const columns = workshopFeedbackImport.columns.map((column) => ({
  field: column.field,
  label: column.label,
  aliases: column.aliases,
  matchPrefix: column.matchPrefix,
}));

function read(rows: string[][]) {
  return parseGrid([HEADERS, ...rows], columns).rows;
}

const ROW = [
  '8/24/2026 19:45:34',
  'v26001@astra.xlri.ac.in',
  'ankita mahajani',
  'v26001',
  '5',
  '5',
  '5',
  '5',
  'learned how important it is to do correct positioning',
];

describe('a feedback export header', () => {
  it('claims each scale question by its number, not its wording', () => {
    const [row] = read([ROW]);

    expect(row).toMatchObject({
      rollNumber: 'v26001',
      overallRating: '5',
      understandingRating: '5',
      speakerRating: '5',
      relevanceRating: '5',
      takeaway: 'learned how important it is to do correct positioning',
    });
  });

  it('goes on matching after the questions are reworded', () => {
    const reworded = [...HEADERS];
    reworded[4] = '1) Rate the session';
    reworded[6] = '3) Was the speaker any good?';

    const [row] = parseGrid([reworded, ROW], columns).rows;

    expect(row?.overallRating).toBe('5');
    expect(row?.speakerRating).toBe('5');
  });

  it('does not let one question take another question column', () => {
    const [row] = read([ROW]);

    // Every numbered question found its own column: four distinct ratings and
    // the comment, not the same cell read five times.
    expect(row?.takeaway).not.toBe('5');
  });

  it('reads the roll number from a heading written any of the usual ways', () => {
    for (const heading of ['Roll No.', 'Roll Number', 'roll_number', 'Roll No']) {
      const headers = [...HEADERS];
      headers[3] = heading;

      const [row] = parseGrid([headers, ROW], columns).rows;
      expect(row?.rollNumber, heading).toBe('v26001');
    }
  });
});

describe('the questions a form asked', () => {
  it('keeps each heading whole, scale note and all, against the field it fed', () => {
    const { matched } = parseGrid([HEADERS, ROW], columns);

    expect(matched.overallRating).toBe(HEADERS[4]);
    expect(matched.understandingRating).toBe(HEADERS[5]);
    expect(matched.speakerRating).toBe(HEADERS[6]);
    expect(matched.relevanceRating).toBe(HEADERS[7]);
    expect(matched.takeaway).toBe(HEADERS[8]);
  });

  it('reports the wording of the file in hand, not the template it was matched by', () => {
    // The point of storing these: one workshop's form asks about that
    // workshop, and the answers mean nothing without the question.
    const ipLaw = [...HEADERS];
    ipLaw[5] =
      '2) How effectively did the session help you understand the key aspects and challenges of IP Law and IP Strategy? (5 being the highest and 1 being the lowest)';

    const { matched } = parseGrid([ipLaw, ROW], columns);

    expect(matched.understandingRating).toBe(ipLaw[5]);
    expect(matched.understandingRating).toContain('IP Law');
  });

  it('names no question for a column the file does not have', () => {
    const short = HEADERS.slice(0, 5);
    const { matched } = parseGrid([short, ROW.slice(0, 5)], columns);

    expect(matched.overallRating).toBe(HEADERS[4]);
    expect(matched.speakerRating).toBeUndefined();
    expect(matched.takeaway).toBeUndefined();
  });
});

describe('a single response', () => {
  const parse = (values: string[]) =>
    workshopFeedbackImport.schema.safeParse(read([values])[0] ?? {});

  it('is accepted as the export writes it, uppercasing nothing itself', () => {
    const result = parse(ROW);
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.rollNumber).toBe('v26001');
    expect(result.data.overallRating).toBe(5);
    expect(result.data.email).toBe('v26001@astra.xlri.ac.in');
  });

  it('keeps a response that answered the scales and wrote nothing', () => {
    const silent = [...ROW];
    silent[8] = '';

    const result = parse(silent);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.takeaway).toBeUndefined();
  });

  it('keeps a response that skipped a question it was allowed to skip', () => {
    const partial = [...ROW];
    partial[7] = '';

    const result = parse(partial);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.relevanceRating).toBeNull();
  });

  it('keeps a response that rated nothing at all, which is still feedback', () => {
    const unrated = [...ROW];
    for (const column of [4, 5, 6, 7]) unrated[column] = '';

    const result = parse(unrated);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.overallRating).toBeNull();
    expect(result.data.takeaway).toBe('learned how important it is to do correct positioning');
  });

  it('refuses a rating outside the scale, whichever way it is wrong', () => {
    for (const bad of ['0', '6', '4.5', 'five']) {
      const wrong = [...ROW];
      wrong[4] = bad;
      expect(parse(wrong).success, bad).toBe(false);
    }
  });

  it('refuses a row that names nobody, rather than importing it unattached', () => {
    const anonymous = [...ROW];
    anonymous[3] = '';

    expect(parse(anonymous).success).toBe(false);
  });

  it('reads the form timestamp month-first, and a workbook date as it stands', () => {
    const csvStyle = parse(ROW);
    expect(csvStyle.success).toBe(true);
    if (!csvStyle.success) return;
    expect(csvStyle.data.submittedAt?.toISOString()).toBe('2026-08-24T19:45:34.000Z');

    // A workbook hands the same cell over already parsed, as a plain date.
    const fromWorkbook = [...ROW];
    fromWorkbook[0] = '2026-08-24';

    const xlsxStyle = parse(fromWorkbook);
    expect(xlsxStyle.success).toBe(true);
    if (!xlsxStyle.success) return;
    expect(xlsxStyle.data.submittedAt?.toISOString()).toBe('2026-08-24T00:00:00.000Z');
  });

  it('keeps a response whose timestamp it cannot read', () => {
    const undated = [...ROW];
    undated[0] = 'last Tuesday';

    const result = parse(undated);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.submittedAt).toBeNull();
  });
});

describe('the file as a whole', () => {
  it('catches a student answering twice, which would otherwise overwrite itself', () => {
    const rows = read([ROW, ROW]).map((row) => workshopFeedbackImport.schema.parse(row));

    const problems = workshopFeedbackImport.validateBatch?.(rows) ?? [];
    expect(problems).toHaveLength(1);
    expect(problems[0]?.message).toContain('Duplicate roll number');
  });
});

describe('which workshop the responses belong to', () => {
  const row = workshopFeedbackImport.schema.parse(read([ROW])[0]!);

  it('refuses to write when the import was not started from a workshop', async () => {
    await expect(
      workshopFeedbackImport.commit(row, { actorId: 'a'.repeat(24), params: {} }),
    ).rejects.toThrow(/from a workshop/i);
  });

  it('will not take the workshop from anything the file could carry', async () => {
    await expect(
      workshopFeedbackImport.commit(row, {
        actorId: 'a'.repeat(24),
        params: { workshopId: 'the-marketing-one' },
      }),
    ).rejects.toThrow(/from a workshop/i);
  });
});
