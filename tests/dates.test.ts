import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  durationInDays,
  formatDate,
  formatDateRange,
  isEndOnOrAfterStart,
  relativeDayLabel,
  startOfTodayUtc,
  windowState,
} from '@/lib/utils/dates';

const utc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('duration', () => {
  it('matches the programme example: 09 Nov → 27 Nov is 19 days', () => {
    expect(durationInDays(utc('2026-11-09'), utc('2026-11-27'))).toBe(19);
  });

  it('counts a single-day activity as 1 day', () => {
    expect(durationInDays(utc('2026-11-09'), utc('2026-11-09'))).toBe(1);
  });

  it('handles a 14-day window inclusively', () => {
    expect(durationInDays(utc('2026-11-09'), utc('2026-11-22'))).toBe(14);
  });

  it('spans month boundaries', () => {
    expect(durationInDays(utc('2026-11-25'), utc('2026-12-08'))).toBe(14);
  });

  it('does not reject durations outside the 12–15 day guideline', () => {
    // The guideline is advisory; only endDate >= startDate is a hard rule.
    expect(isEndOnOrAfterStart(utc('2026-11-09'), utc('2026-11-10'))).toBe(true);
    expect(durationInDays(utc('2026-11-09'), utc('2026-12-31'))).toBe(53);
  });
});

describe('date ordering', () => {
  it('accepts an end date after the start date', () => {
    expect(isEndOnOrAfterStart(utc('2026-11-09'), utc('2026-11-27'))).toBe(true);
  });

  it('accepts an end date equal to the start date', () => {
    expect(isEndOnOrAfterStart(utc('2026-11-09'), utc('2026-11-09'))).toBe(true);
  });

  it('rejects an end date before the start date', () => {
    expect(isEndOnOrAfterStart(utc('2026-11-27'), utc('2026-11-09'))).toBe(false);
  });
});

describe('window state', () => {
  it('is BEFORE ahead of the start date', () => {
    expect(windowState(utc('2026-11-09'), utc('2026-11-27'), utc('2026-11-01'))).toBe('BEFORE');
  });

  it('is OPEN on the boundary days', () => {
    expect(windowState(utc('2026-11-09'), utc('2026-11-27'), utc('2026-11-09'))).toBe('OPEN');
    expect(windowState(utc('2026-11-09'), utc('2026-11-27'), utc('2026-11-27'))).toBe('OPEN');
  });

  it('is AFTER once the end date has passed', () => {
    expect(windowState(utc('2026-11-09'), utc('2026-11-27'), utc('2026-11-28'))).toBe('AFTER');
  });
});

describe('display', () => {
  it('formats the programme example', () => {
    expect(formatDate(utc('2026-11-09'))).toBe('09 Nov 2026');
    expect(formatDateRange(utc('2026-11-09'), utc('2026-11-27'))).toBe('09 Nov 2026 → 27 Nov 2026');
  });

  it('renders a dash for missing dates', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDateRange(null, null)).toBe('—');
  });
});

describe('relative days', () => {
  const now = utc('2026-11-09');

  it('names the days a student actually thinks in', () => {
    expect(relativeDayLabel(utc('2026-11-09'), now)).toBe('Today');
    expect(relativeDayLabel(utc('2026-11-10'), now)).toBe('Tomorrow');
    expect(relativeDayLabel(utc('2026-11-08'), now)).toBe('Yesterday');
  });

  it('counts in days up to a fortnight, then in weeks', () => {
    expect(relativeDayLabel(utc('2026-11-13'), now)).toBe('In 4 days');
    expect(relativeDayLabel(utc('2026-11-23'), now)).toBe('In 2 weeks');
    expect(relativeDayLabel(utc('2026-10-26'), now)).toBe('2 weeks ago');
  });

  it('switches to months once weeks stop being useful', () => {
    expect(relativeDayLabel(utc('2027-02-07'), now)).toBe('In 3 months');
  });

  it('ignores the time of day on either side', () => {
    // A workshop is stored at UTC midnight but "now" is whatever o'clock it
    // happens to be, so a naive subtraction would call a session later today
    // "yesterday" for most of the working day.
    const afternoon = new Date('2026-11-09T16:45:00.000Z');
    expect(relativeDayLabel(utc('2026-11-09'), afternoon)).toBe('Today');
    expect(relativeDayLabel(utc('2026-11-10'), afternoon)).toBe('Tomorrow');
  });

  it('measures from the start of today, so today is not yet past', () => {
    expect(daysUntil(utc('2026-11-09'), new Date('2026-11-09T23:59:00.000Z'))).toBe(0);
    expect(startOfTodayUtc(new Date('2026-11-09T23:59:00.000Z')).toISOString()).toBe(
      '2026-11-09T00:00:00.000Z',
    );
  });
});
