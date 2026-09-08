import { describe, expect, it } from 'vitest';
import { recordingFolderSchema, recordingSchema } from '@/validators/recordings';

/**
 * The register's rules: which columns a row cannot be filed without, and what
 * counts as a link.
 *
 * These run against the same schema the Server Action parses with, so a rule
 * that passes here is the rule the server actually enforces.
 */

const VALID = {
  event: 'Presentation',
  date: '2026-08-07',
  timings: '2:00 PM to 4:00 PM',
  batch: 'Batch 26-28',
  venue: 'Amphitheatre',
  zoomLink: 'https://xlri-ac-in.zoom.us/j/81288986682?pwd=WyMxniAUIcRob2e7INKbAUnwynravE.1',
  meetingId: '812 8898 6682',
  passcode: 'xlri2026',
  recordingLink: 'https://xlri-ac-in.zoom.us/rec/share/clGxEzF4gcAcVuHEFSxvQ8pJJflEPRZ2zsNfl',
  recordingPasscode: '9w8?SMxK',
};

function parse(overrides: Record<string, unknown> = {}) {
  return recordingSchema.safeParse({ ...VALID, ...overrides });
}

/** The field paths a failed parse complained about. */
function errorPaths(result: ReturnType<typeof parse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('a row needs an event and a date, and nothing else', () => {
  it('accepts a fully filled row', () => {
    expect(parse().success).toBe(true);
  });

  it('accepts a session filed before its recording exists', () => {
    const result = parse({ recordingLink: '', recordingPasscode: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.recordingLink).toBeUndefined();
  });

  it('accepts a row with nothing but an event and a date', () => {
    expect(recordingSchema.safeParse({ event: 'Workshop', date: '2026-08-22' }).success).toBe(true);
  });

  it('requires an event', () => {
    expect(errorPaths(parse({ event: '' }))).toContain('event');
    expect(errorPaths(parse({ event: '   ' }))).toContain('event');
  });

  it('requires a date', () => {
    expect(errorPaths(parse({ date: '' }))).toContain('date');
  });
});

describe('the links are checked, the rest is taken as typed', () => {
  it('rejects a javascript: URL in either link', () => {
    expect(errorPaths(parse({ zoomLink: 'javascript:alert(1)' }))).toContain('zoomLink');
    expect(errorPaths(parse({ recordingLink: 'javascript:alert(1)' }))).toContain('recordingLink');
  });

  it('rejects free text that is not a URL at all', () => {
    expect(errorPaths(parse({ recordingLink: 'The presentation did not take place' }))).toContain(
      'recordingLink',
    );
  });

  it('accepts a link that is not Zoom or Drive', () => {
    expect(
      parse({ recordingLink: 'https://xlri-my.sharepoint.com/personal/x/rec.mp4' }).success,
    ).toBe(true);
  });

  it('keeps timings and batch exactly as typed', () => {
    const result = parse({ timings: '10:00 AM – 12:00 PM', batch: 'Both batches' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.timings).toBe('10:00 AM – 12:00 PM');
    expect(result.data.batch).toBe('Both batches');
  });

  it('stores a blank optional column as nothing rather than as an empty string', () => {
    const result = parse({ venue: '', passcode: '' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.venue).toBeUndefined();
    expect(result.data.passcode).toBeUndefined();
  });
});

describe('the shared folder link', () => {
  it('accepts a Drive folder link', () => {
    const result = recordingFolderSchema.safeParse({
      link: 'https://drive.google.com/drive/folders/1abcDEF',
    });
    expect(result.success).toBe(true);
  });

  it('reads an empty submission as "take the banner down"', () => {
    const result = recordingFolderSchema.safeParse({ link: '' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.link).toBeUndefined();
  });

  it('rejects a javascript: URL', () => {
    expect(recordingFolderSchema.safeParse({ link: 'javascript:alert(1)' }).success).toBe(false);
  });
});
