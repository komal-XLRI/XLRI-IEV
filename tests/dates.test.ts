import { describe, expect, it } from 'vitest';
import {
  durationInDays,
  formatDate,
  formatDateRange,
  isEndOnOrAfterStart,
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
