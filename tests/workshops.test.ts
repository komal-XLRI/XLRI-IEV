import { describe, expect, it } from 'vitest';
import { createWorkshopSchema, workshopStatusSchema } from '@/validators/workshops';
import {
  WORKSHOP_MODES,
  WORKSHOP_STATUSES,
  WORKSHOP_TYPES,
  WORKSHOP_TYPE_LABELS,
  requiresMeetingLink,
  requiresVenue,
} from '@/lib/constants/workshops';

/**
 * The workshop rules that are not obvious from the schema shape: which fields a
 * mode makes mandatory, and what counts as a LinkedIn profile.
 *
 * These run against the same schema the Server Action parses with, so a rule
 * that passes here is the rule the server actually enforces.
 */

const VALID = {
  title: 'Building a venture pitch',
  date: '2026-09-14',
  startTime: '10:00',
  endTime: '12:30',
  mode: 'OFFLINE',
  venue: 'XLRI Jamshedpur, Auditorium 2',
  hostName: 'A. Host',
  speakerName: 'B. Speaker',
};

function parse(overrides: Record<string, unknown> = {}) {
  return createWorkshopSchema.safeParse({ ...VALID, ...overrides });
}

/** The field paths a failed parse complained about. */
function errorPaths(result: ReturnType<typeof parse>): string[] {
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
}

describe('mode decides which location field is required', () => {
  it('accepts an offline workshop with a venue', () => {
    expect(parse().success).toBe(true);
  });

  it('rejects an offline workshop with no venue', () => {
    const result = parse({ venue: '' });
    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('venue');
  });

  it('rejects an online workshop with no meeting link', () => {
    const result = parse({ mode: 'ONLINE', venue: '' });
    expect(result.success).toBe(false);
    expect(errorPaths(result)).toContain('meetingLink');
  });

  it('accepts an online workshop with a meeting link and no venue', () => {
    expect(parse({ mode: 'ONLINE', venue: '', meetingLink: 'https://meet.example.com/abc' }).success)
      .toBe(true);
  });

  it('requires both a venue and a link for a hybrid workshop', () => {
    const neither = parse({ mode: 'HYBRID', venue: '' });
    expect(errorPaths(neither)).toEqual(expect.arrayContaining(['venue', 'meetingLink']));

    const venueOnly = parse({ mode: 'HYBRID' });
    expect(errorPaths(venueOnly)).toContain('meetingLink');

    const both = parse({ mode: 'HYBRID', meetingLink: 'https://meet.example.com/abc' });
    expect(both.success).toBe(true);
  });

  it('agrees with the helpers the form uses to show the fields', () => {
    // The form hides a field when the helper says it is not needed; if the two
    // ever disagree, a required field becomes unreachable in the UI.
    for (const mode of WORKSHOP_MODES) {
      const withoutVenue = parse({ mode, venue: '', meetingLink: 'https://meet.example.com/a' });
      expect(errorPaths(withoutVenue).includes('venue')).toBe(requiresVenue(mode));

      const withoutLink = parse({ mode, venue: 'Somewhere', meetingLink: '' });
      expect(errorPaths(withoutLink).includes('meetingLink')).toBe(requiresMeetingLink(mode));
    }
  });
});

describe('LinkedIn profiles', () => {
  it('accepts a linkedin.com profile URL', () => {
    expect(parse({ hostLinkedIn: 'https://www.linkedin.com/in/someone/' }).success).toBe(true);
    expect(parse({ speakerLinkedIn: 'https://linkedin.com/in/someone' }).success).toBe(true);
    expect(parse({ speakerLinkedIn: 'https://in.linkedin.com/in/someone' }).success).toBe(true);
  });

  it('treats the field as optional', () => {
    expect(parse({ hostLinkedIn: '', speakerLinkedIn: '' }).success).toBe(true);
  });

  it('rejects a string that is not a URL', () => {
    expect(errorPaths(parse({ hostLinkedIn: 'linkedin' }))).toContain('hostLinkedIn');
  });

  it('rejects a well-formed URL on another host', () => {
    expect(errorPaths(parse({ speakerLinkedIn: 'https://example.com/in/someone' }))).toContain(
      'speakerLinkedIn',
    );
  });

  it('rejects a lookalike host', () => {
    expect(errorPaths(parse({ hostLinkedIn: 'https://linkedin.com.evil.test/in/x' }))).toContain(
      'hostLinkedIn',
    );
  });

  it('rejects a javascript: URL', () => {
    // These render as links; a javascript: URL that reached the page would run.
    expect(errorPaths(parse({ hostLinkedIn: 'javascript:alert(1)' }))).toContain('hostLinkedIn');
  });
});

describe('other links', () => {
  it('requires http(s) for the meeting and registration links', () => {
    expect(errorPaths(parse({ mode: 'ONLINE', venue: '', meetingLink: 'meet.example.com' })))
      .toContain('meetingLink');
    expect(errorPaths(parse({ registrationLink: 'javascript:alert(1)' }))).toContain(
      'registrationLink',
    );
  });

  it('accepts an absent registration link', () => {
    expect(parse({ registrationLink: '' }).success).toBe(true);
  });
});

describe('times and required fields', () => {
  it('rejects an end time at or before the start', () => {
    expect(errorPaths(parse({ startTime: '12:00', endTime: '12:00' }))).toContain('endTime');
    expect(errorPaths(parse({ startTime: '12:00', endTime: '09:00' }))).toContain('endTime');
  });

  it('rejects a time that is not 24-hour HH:mm', () => {
    expect(errorPaths(parse({ startTime: '9am' }))).toContain('startTime');
    expect(errorPaths(parse({ endTime: '25:00' }))).toContain('endTime');
  });

  it('requires a title, a host and a speaker', () => {
    expect(errorPaths(parse({ title: '' }))).toContain('title');
    expect(errorPaths(parse({ hostName: '' }))).toContain('hostName');
    expect(errorPaths(parse({ speakerName: '' }))).toContain('speakerName');
  });

  it('defaults a new workshop to DRAFT', () => {
    const result = parse();
    expect(result.success && result.data.status).toBe('DRAFT');
  });

  it('normalises blank optional text to undefined rather than an empty string', () => {
    const result = parse({ description: '', hostDesignation: '' });
    expect(result.success && result.data.description).toBeUndefined();
    expect(result.success && result.data.hostDesignation).toBeUndefined();
  });
});

describe('workshop type', () => {
  it('accepts every type in the list', () => {
    for (const workshopType of WORKSHOP_TYPES) {
      expect(parse({ workshopType }).success).toBe(true);
    }
  });

  it('defaults to OTHER when none is given', () => {
    // Workshops created before the field existed have to stay valid, so the
    // schema supplies a value rather than refusing the record.
    const result = parse();
    expect(result.success && result.data.workshopType).toBe('OTHER');
  });

  it('rejects a type outside the list', () => {
    expect(errorPaths(parse({ workshopType: 'FIELD_TRIP' }))).toContain('workshopType');
  });

  it('is independent of mode — any type can run in any mode', () => {
    expect(
      parse({ workshopType: 'INDUSTRIAL_VISIT', mode: 'ONLINE', venue: '', meetingLink: 'https://x.test/a' })
        .success,
    ).toBe(true);
    expect(parse({ workshopType: 'FOUNDER_TALK', mode: 'OFFLINE' }).success).toBe(true);
  });

  it('has a label for every type', () => {
    for (const workshopType of WORKSHOP_TYPES) {
      expect(WORKSHOP_TYPE_LABELS[workshopType]).toBeTruthy();
    }
  });
});

describe('status transitions', () => {
  it('accepts every published status name', () => {
    for (const status of WORKSHOP_STATUSES) {
      expect(workshopStatusSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it('rejects an invented status', () => {
    expect(workshopStatusSchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });
});
