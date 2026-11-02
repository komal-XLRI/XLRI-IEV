import { describe, expect, it } from 'vitest';
import {
  FeedbackSheetFormatError,
  parseFeedbackSheet,
} from '@/lib/feedbackSheet/parseFeedbackSheet';

describe('stage feedback sheet parsing', () => {
  it('matches on roll number and keeps every other column for the student', () => {
    const parsed = parseFeedbackSheet([
      ['Sr No', 'Name', 'Roll No.', 'Email', 'Mentor', 'Score', 'Comments'],
      ['1', 'Asha', 'pgdm-01', 'Asha@X.com', 'Dr Rao', '8', 'Sharp pitch'],
      ['2', 'Ben', 'PGDM-02', '', 'Dr Rao', '', 'Needs numbers'],
    ]);

    expect(parsed.matchedOn).toBe('Roll No.');
    expect(parsed.rows[0]).toEqual({
      line: 2,
      rollNumber: 'PGDM-01',
      email: 'asha@x.com',
      fields: [
        { label: 'Mentor', value: 'Dr Rao' },
        { label: 'Score', value: '8' },
        { label: 'Comments', value: 'Sharp pitch' },
      ],
    });
    // Blank cells are left out rather than shown empty.
    expect(parsed.rows[1]!.fields.map((f) => f.label)).toEqual(['Mentor', 'Comments']);
  });

  it('finds the heading row under a title block, and falls back to email', () => {
    const parsed = parseFeedbackSheet([
      ['V01 Mentor feedback'],
      [],
      ['Email Address', 'Feedback'],
      ['a@x.com', 'Good'],
      ['', ''],
    ]);
    expect(parsed.matchedOn).toBe('Email Address');
    expect(parsed.rows).toEqual([
      {
        line: 4,
        rollNumber: null,
        email: 'a@x.com',
        fields: [{ label: 'Feedback', value: 'Good' }],
      },
    ]);
  });

  it('refuses a sheet with no column naming the student', () => {
    expect(() =>
      parseFeedbackSheet([
        ['Name', 'Feedback'],
        ['Asha', 'Good'],
      ]),
    ).toThrow(FeedbackSheetFormatError);
  });

  it('refuses a sheet with headings and no rows', () => {
    expect(() => parseFeedbackSheet([['Roll Number', 'Feedback']])).toThrow(/no rows/);
  });
});
