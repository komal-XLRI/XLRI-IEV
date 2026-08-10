import { describe, expect, it } from 'vitest';
import { toWinAnsi, __testables } from '@/lib/export/pdf';
import { toPrintableHtml } from '@/lib/export/printable';
import { eraseRowType } from '@/lib/export/types';

const { fit, columnWidths } = __testables;

/** Rough Helvetica stand-in: every glyph is half the font size wide. */
const font = {
  widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.5,
} as unknown as Parameters<typeof fit>[1];

describe('WinAnsi sanitisation', () => {
  it('passes ASCII through untouched', () => {
    expect(toWinAnsi('Idea Generation V01')).toBe('Idea Generation V01');
  });

  it('substitutes the typographic characters this app produces', () => {
    // pdf-lib's standard fonts throw on these, so they must never reach it.
    expect(toWinAnsi('09 Nov → 27 Nov')).toBe('09 Nov -> 27 Nov');
    expect(toWinAnsi('A1 · Classroom')).toBe('A1 - Classroom');
    expect(toWinAnsi('12–15 days')).toBe('12-15 days');
    expect(toWinAnsi('guideline — advisory')).toBe('guideline - advisory');
    expect(toWinAnsi('reviewers’ comments')).toBe("reviewers' comments");
    expect(toWinAnsi('done ✓')).toBe('done Y');
  });

  it('keeps Latin-1 accented characters, which WinAnsi supports', () => {
    expect(toWinAnsi('café résumé')).toBe('café résumé');
  });

  it('drops characters outside the encoding rather than throwing', () => {
    expect(toWinAnsi('venture 日本 name')).toBe('venture  name');
    expect(toWinAnsi('emoji 🚀 here')).toBe('emoji  here');
  });

  it('flattens tabs and newlines to spaces', () => {
    expect(toWinAnsi('a\tb\nc')).toBe('a b c');
  });
});

describe('text fitting', () => {
  it('returns the text unchanged when it fits', () => {
    expect(fit('short', font, 10, 100)).toBe('short');
  });

  it('truncates with an ellipsis when it does not', () => {
    const result = fit('a very long piece of cell text', font, 10, 50);
    expect(result.endsWith('...')).toBe(true);
    expect(result.length).toBeLessThan('a very long piece of cell text'.length);
  });

  it('returns empty for a non-positive width', () => {
    expect(fit('text', font, 10, 0)).toBe('');
    expect(fit('text', font, 10, -5)).toBe('');
  });

  it('never exceeds the width it was given', () => {
    const width = 60;
    const result = fit('an extremely long string that must be cut down', font, 10, width);
    expect(font.widthOfTextAtSize(result, 10)).toBeLessThanOrEqual(width);
  });
});

describe('column width distribution', () => {
  const dataset = (widths: number[]) =>
    eraseRowType({
      meta: {
        title: 't',
        filters: [],
        generatedAt: new Date(),
        generatedBy: 'x',
        fileBase: 'f',
      },
      columns: widths.map((width, index) => ({
        key: String(index),
        header: String(index),
        width,
        value: () => '',
      })),
      rows: [],
    });

  it('fills exactly the available width', () => {
    const result = columnWidths(dataset([10, 20, 30]), 600);
    expect(result.reduce((sum, w) => sum + w, 0)).toBeCloseTo(600, 1);
  });

  it('allocates proportionally to the hints', () => {
    const [a, b] = columnWidths(dataset([10, 30]), 800);
    expect(b! / a!).toBeCloseTo(3, 1);
  });

  it('lifts very narrow columns to a readable minimum', () => {
    const result = columnWidths(dataset([1, 1, 100]), 800);
    expect(Math.min(...result)).toBeGreaterThanOrEqual(36);
  });

  it('still fits the page after lifting the minimum', () => {
    const result = columnWidths(dataset([1, 1, 1, 1, 100]), 700);
    expect(result.reduce((sum, w) => sum + w, 0)).toBeLessThanOrEqual(701);
  });
});

describe('printable HTML', () => {
  const dataset = eraseRowType({
    meta: {
      title: 'Student progress',
      subtitle: 'Both reviewers must approve',
      filters: [{ label: 'Term', value: 'Term 2' }],
      sort: 'Percentage (descending)',
      generatedAt: new Date('2026-08-08T10:15:00.000Z'),
      generatedBy: 'Admin',
      fileBase: 'student-progress',
    },
    columns: [{ key: 'name', header: 'Student', value: (r: { name: string }) => r.name }],
    rows: [{ name: '<script>alert(1)</script>' }],
  });

  const html = toPrintableHtml(dataset);

  it('renders a complete document', () => {
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>Student progress · IEV Tracker · XLRI</title>');
  });

  it('carries the XLRI letterhead, inlined so the file survives being saved', () => {
    // No <img src>: a linked logo prints as a gap once the document leaves this
    // origin, and the animated source would be captured mid-fade by print().
    expect(html).toContain('<svg');
    expect(html).toContain('XLRI Xavier School of Management');
    expect(html).not.toContain('xlri-logo.svg');
    expect(html).not.toContain('@keyframes');
  });

  it('states who generated it and when', () => {
    expect(html).toContain('08 Aug 2026, 10:15');
    expect(html).toContain('<b>By</b> Admin');
  });

  it('shows the applied filters as chips', () => {
    expect(html).toContain('Term: Term 2');
    expect(html).toContain('Sorted by: Percentage (descending)');
  });

  it('escapes cell content rather than injecting it', () => {
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('repeats the table header across printed pages', () => {
    expect(html).toContain('thead { display: table-header-group; }');
  });

  it('auto-triggers the print dialog by default', () => {
    expect(html).toContain('window.print()');
  });

  it('can be rendered without the auto-print hook', () => {
    const quiet = toPrintableHtml(dataset, { auto: false });
    expect(quiet).not.toContain('window.addEventListener("load"');
  });

  it('handles an empty result set', () => {
    const empty = toPrintableHtml(eraseRowType({ ...dataset, rows: [] }));
    expect(empty).toContain('No rows matched the selected filters.');
  });
});
