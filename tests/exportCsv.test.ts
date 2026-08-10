import { describe, expect, it } from 'vitest';
import { escapeCsvValue, toCsv, toCsvRow } from '@/lib/export/csv';
import { formatCell, nativeCell } from '@/lib/export/format';
import { buildFilename, contentDisposition } from '@/lib/export/respond';
import { eraseRowType, isExportFormat } from '@/lib/export/types';

describe('CSV escaping', () => {
  it('leaves plain values alone', () => {
    expect(escapeCsvValue('Asha Ramanathan')).toBe('Asha Ramanathan');
  });

  it('quotes values containing a comma', () => {
    expect(escapeCsvValue('Iyer, Meera')).toBe('"Iyer, Meera"');
  });

  it('doubles embedded quotes', () => {
    expect(escapeCsvValue('She said "no"')).toBe('"She said ""no"""');
  });

  it('quotes values containing newlines', () => {
    expect(escapeCsvValue('line one\nline two')).toBe('"line one\nline two"');
  });

  it('neutralises formula injection', () => {
    // A leading = would execute as a formula when opened in Excel.
    expect(escapeCsvValue('=SUM(A1:A9)')).toBe('"\t=SUM(A1:A9)"');
    expect(escapeCsvValue('+1234')).toBe('"\t+1234"');
    expect(escapeCsvValue('-1234')).toBe('"\t-1234"');
    expect(escapeCsvValue('@cmd')).toBe('"\t@cmd"');
  });

  it('does not mangle an ordinary negative number in text form', () => {
    // Guarded, but the visible text is unchanged once the tab is stripped.
    expect(escapeCsvValue('-5').replace(/^"?\t/, '').replace(/"$/, '')).toBe('-5');
  });

  it('emits an empty field for an empty string', () => {
    expect(escapeCsvValue('')).toBe('');
  });

  it('joins a row with commas', () => {
    expect(toCsvRow(['a', 'b,c', 'd'])).toBe('a,"b,c",d');
  });
});

describe('cell formatting', () => {
  const date = new Date('2026-11-09T14:30:00.000Z');

  it('formats dates and datetimes', () => {
    expect(formatCell(date, 'date')).toBe('09 Nov 2026');
    expect(formatCell(date, 'datetime')).toContain('09 Nov 2026');
  });

  it('renders percent and boolean types', () => {
    expect(formatCell(75, 'percent')).toBe('75%');
    expect(formatCell(true, 'boolean')).toBe('Yes');
    expect(formatCell(false, 'boolean')).toBe('No');
  });

  it('renders null and undefined as empty, never "null"', () => {
    expect(formatCell(null)).toBe('');
    expect(formatCell(undefined)).toBe('');
  });

  it('keeps numbers and dates native for Excel', () => {
    expect(nativeCell(42, 'number')).toBe(42);
    expect(nativeCell(date, 'date')).toBe(date);
    // Excel percent format expects a fraction.
    expect(nativeCell(75, 'percent')).toBe(0.75);
  });
});

describe('filenames', () => {
  const at = new Date('2026-08-08T10:15:00.000Z');

  it('slugs the base and stamps the time', () => {
    expect(buildFilename('Student progress', at, 'xlsx')).toBe(
      'student-progress-2026-08-08-1015.xlsx',
    );
  });

  it('uses the right extension per format', () => {
    expect(buildFilename('x', at, 'csv')).toMatch(/\.csv$/);
    expect(buildFilename('x', at, 'pdf')).toMatch(/\.pdf$/);
    expect(buildFilename('x', at, 'print')).toMatch(/\.html$/);
  });

  it('collapses punctuation and never emits a leading or trailing dash', () => {
    expect(buildFilename('  ***Reviews & Reports!!  ', at, 'csv')).toBe(
      'reviews-reports-2026-08-08-1015.csv',
    );
  });

  it('falls back when the base slugs to nothing', () => {
    expect(buildFilename('***', at, 'csv')).toBe('export-2026-08-08-1015.csv');
  });
});

describe('content disposition', () => {
  it('marks downloads as attachments and print as inline', () => {
    expect(contentDisposition('a.csv', false)).toContain('attachment');
    expect(contentDisposition('a.html', true)).toContain('inline');
  });

  it('supplies both an ASCII fallback and a UTF-8 form', () => {
    const header = contentDisposition('rapport-café.csv', false);
    expect(header).toContain('filename="rapport-caf_.csv"');
    expect(header).toContain("filename*=UTF-8''rapport-caf%C3%A9.csv");
  });
});

describe('format guard', () => {
  it('accepts the four supported formats', () => {
    for (const format of ['xlsx', 'csv', 'pdf', 'print']) {
      expect(isExportFormat(format)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    expect(isExportFormat('exe')).toBe(false);
    expect(isExportFormat('')).toBe(false);
    expect(isExportFormat(null)).toBe(false);
  });
});

describe('CSV document', () => {
  const dataset = eraseRowType({
    meta: {
      title: 'Student progress',
      filters: [{ label: 'Term', value: 'Term 2' }],
      sort: 'Percentage (descending)',
      generatedAt: new Date('2026-08-08T10:15:00.000Z'),
      generatedBy: 'Admin (admin@example.com)',
      fileBase: 'student-progress',
    },
    columns: [
      { key: 'name', header: 'Student', value: (r: { name: string; pct: number }) => r.name },
      {
        key: 'pct',
        header: 'Progress',
        type: 'percent' as const,
        value: (r: { name: string; pct: number }) => r.pct,
      },
    ],
    rows: [
      { name: 'Asha', pct: 50 },
      { name: 'Iyer, Meera', pct: 75 },
    ],
    summary: [{ label: 'Students', value: '2' }],
  });

  const csv = toCsv(dataset);

  it('starts with a BOM so Excel reads UTF-8', () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });

  it('records the applied filters and provenance', () => {
    expect(csv).toContain('Student progress');
    expect(csv).toContain('Term,Term 2');
    expect(csv).toContain('Sorted by,Percentage (descending)');
    expect(csv).toContain('Generated by,Admin (admin@example.com)');
  });

  it('writes the header and data rows with escaping', () => {
    expect(csv).toContain('Student,Progress');
    expect(csv).toContain('Asha,50%');
    expect(csv).toContain('"Iyer, Meera",75%');
  });

  it('appends the summary', () => {
    expect(csv).toContain('Students,2');
  });

  it('uses CRLF line endings', () => {
    expect(csv).toContain('\r\n');
  });

  it('can omit the preamble when only the grid is wanted', () => {
    const bare = toCsv(dataset, { preamble: false });
    expect(bare).not.toContain('Sorted by');
    expect(bare).toContain('Student,Progress');
  });
});
