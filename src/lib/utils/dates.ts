const MS_PER_DAY = 24 * 60 * 60 * 1000;

function startOfUtcDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * Inclusive duration in days between two dates.
 * 09 Nov → 09 Nov is 1 day; 09 Nov → 27 Nov is 19 days.
 */
export function durationInDays(startDate: Date, endDate: Date): number {
  return Math.round((startOfUtcDay(endDate) - startOfUtcDay(startDate)) / MS_PER_DAY) + 1;
}

export function isEndOnOrAfterStart(startDate: Date, endDate: Date): boolean {
  return startOfUtcDay(endDate) >= startOfUtcDay(startDate);
}

export type DateWindowState = 'BEFORE' | 'OPEN' | 'AFTER';

export function windowState(
  startDate: Date,
  endDate: Date,
  now: Date = new Date(),
): DateWindowState {
  const today = startOfUtcDay(now);
  if (today < startOfUtcDay(startDate)) return 'BEFORE';
  if (today > startOfUtcDay(endDate)) return 'AFTER';
  return 'OPEN';
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_TIME_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

/** "09 Nov 2026" */
export function formatDate(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_FORMAT.format(date);
}

/** "09 Nov 2026, 14:30" */
export function formatDateTime(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return DATE_TIME_FORMAT.format(date).replace(', ', ', ');
}

/** "09 Nov 2026 → 27 Nov 2026" */
export function formatDateRange(
  startDate: Date | string | null | undefined,
  endDate: Date | string | null | undefined,
): string {
  if (!startDate || !endDate) return '—';
  return `${formatDate(startDate)} → ${formatDate(endDate)}`;
}

/** Value for an `<input type="date">`. */
export function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}
