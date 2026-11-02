import { describe, expect, it } from 'vitest';
import {
  FeedbackSheetFormatError,
  nameKey,
  parseFeedbackSheet,
  splitStudentCell,
} from '@/lib/feedbackSheet/parseFeedbackSheet';

describe('stage feedback sheet parsing', () => {
  it('reads a feedback form export: student by name, evaluator email hidden', () => {
    const parsed = parseFeedbackSheet([
      [
        'Timestamp',
        'Email Address',
        "Evaluator's name",
        'Student & Startup Names',
        '1) Revenue model is clearly defined.',
        '5) One key suggestion for improvement',
      ],
      [
        '2026-10-12',
        'vikas@example.test',
        'Vikas Gupta',
        'Kushagra Garg - Dhanush',
        '2',
        'Needs to get deeper',
      ],
      ['2026-10-12', 'arpit@example.test', 'Arpit Parija', 'Kushagra Garg - Dhanush', '2', ''],
    ]);

    expect(parsed.matchedOn).toBe('Student & Startup Names');
    expect(parsed.rows[0]).toEqual({
      line: 2,
      rollNumber: null,
      // The form's own email column is the evaluator's, so it never matches a student.
      email: null,
      studentName: 'Kushagra Garg - Dhanush',
      fields: [
        { label: 'Timestamp', value: '2026-10-12' },
        { label: "Evaluator's name", value: 'Vikas Gupta' },
        { label: '1) Revenue model is clearly defined.', value: '2' },
        { label: '5) One key suggestion for improvement', value: 'Needs to get deeper' },
      ],
    });
    // Blank cells are left out rather than shown empty.
    expect(parsed.rows[1]!.fields.map((f) => f.label)).not.toContain(
      '5) One key suggestion for improvement',
    );
  });

  it('prefers a roll number column and keeps the rest', () => {
    const parsed = parseFeedbackSheet([
      ['Sr No', 'Name', 'Roll No.', 'Mentor', 'Score'],
      ['1', 'Asha', 'pgdm-01', 'Dr Rao', '8'],
    ]);
    expect(parsed.matchedOn).toBe('Roll No. / Name');
    expect(parsed.rows[0]).toMatchObject({
      rollNumber: 'PGDM-01',
      studentName: 'Asha',
      fields: [
        { label: 'Mentor', value: 'Dr Rao' },
        { label: 'Score', value: '8' },
      ],
    });
  });

  it('finds the heading row under a title block, and uses a lone email column', () => {
    const parsed = parseFeedbackSheet([
      ['V01 Mentor feedback'],
      [],
      ['Email Address', 'Feedback'],
      ['A@x.com', 'Good'],
      ['', ''],
    ]);
    expect(parsed.matchedOn).toBe('Email Address');
    expect(parsed.rows).toEqual([
      {
        line: 4,
        rollNumber: null,
        email: 'a@x.com',
        studentName: null,
        fields: [{ label: 'Feedback', value: 'Good' }],
      },
    ]);
  });

  it('refuses a sheet with no column naming the student', () => {
    expect(() =>
      parseFeedbackSheet([
        ["Evaluator's name", 'Feedback'],
        ['Dr Rao', 'Good'],
      ]),
    ).toThrow(FeedbackSheetFormatError);
  });

  it('refuses a sheet with headings and no rows', () => {
    expect(() => parseFeedbackSheet([['Roll Number', 'Feedback']])).toThrow(/no rows/);
  });
});

describe('student cells', () => {
  it('splits "Name - Startup" but keeps hyphenated names whole', () => {
    expect(splitStudentCell('Kushagra Garg - Dhanush')).toEqual({
      name: 'Kushagra Garg',
      venture: 'Dhanush',
    });
    expect(splitStudentCell('Anurang Sarda - Ideas electricals & engineering')).toEqual({
      name: 'Anurang Sarda',
      venture: 'Ideas electricals & engineering',
    });
    expect(splitStudentCell('Mary-Jane Roy (Cacaora)')).toEqual({
      name: 'Mary-Jane Roy',
      venture: 'Cacaora',
    });
    expect(splitStudentCell('Bhavya Raj')).toEqual({ name: 'Bhavya Raj', venture: null });
  });

  it('compares names without case, spacing or punctuation', () => {
    expect(nameKey('  Krishna  DAS ')).toBe(nameKey('krishna das'));
    expect(nameKey('Ideas electricals & engineering')).toBe('ideas electricals engineering');
  });
});
