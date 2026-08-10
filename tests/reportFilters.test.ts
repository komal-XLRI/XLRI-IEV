import { describe, expect, it } from 'vitest';
import {
  filtersToSearchParams,
  hasAnyFilter,
  parseReportFilters,
} from '@/validators/reportFilters';
import { sortRows } from '@/services/reports/scope';

const ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';

describe('filter parsing', () => {
  it('reads every documented filter from a query string', () => {
    const params = new URLSearchParams({
      q: 'kirana',
      termId: ID,
      ventureActivityId: ID,
      supportActivityId: ID,
      studentId: ID,
      facultyId: ID,
      mentorId: ID,
      activityStatus: 'COMPLETED',
      dateFrom: '2026-01-01',
      dateTo: '2026-12-31',
      sortBy: 'percentage',
      sortDir: 'desc',
    });

    const filters = parseReportFilters(params);

    expect(filters.q).toBe('kirana');
    expect(filters.termId).toBe(ID);
    expect(filters.activityStatus).toBe('COMPLETED');
    expect(filters.sortBy).toBe('percentage');
    expect(filters.sortDir).toBe('desc');
    expect(filters.dateFrom).toBeInstanceOf(Date);
  });

  it('drops empty values rather than treating them as filters', () => {
    const filters = parseReportFilters(new URLSearchParams({ q: '', termId: '' }));
    expect(filters.q).toBeUndefined();
    expect(filters.termId).toBeUndefined();
  });

  it('ignores a malformed id instead of throwing', () => {
    // The query string is user-editable; a bad value must not 500 the page.
    expect(parseReportFilters(new URLSearchParams({ termId: 'nonsense' })).termId).toBeUndefined();
  });

  it('ignores an unknown enum value', () => {
    expect(
      parseReportFilters(new URLSearchParams({ activityStatus: 'BANANA' })).activityStatus,
    ).toBeUndefined();
  });

  it('ignores an unparseable date', () => {
    expect(
      parseReportFilters(new URLSearchParams({ dateFrom: 'yesterday' })).dateFrom,
    ).toBeUndefined();
  });

  it('accepts a plain object from Next searchParams', () => {
    expect(parseReportFilters({ q: 'x', termId: undefined }).q).toBe('x');
  });

  it('takes the first value when a key repeats', () => {
    expect(parseReportFilters({ q: ['first', 'second'] }).q).toBe('first');
  });
});

describe('round-tripping filters through a URL', () => {
  it('serialises back to a query string', () => {
    const params = filtersToSearchParams({ q: 'kirana', termId: ID, sortDir: 'desc' });
    expect(params.get('q')).toBe('kirana');
    expect(params.get('termId')).toBe(ID);
    expect(params.get('sortDir')).toBe('desc');
  });

  it('omits undefined values', () => {
    expect(filtersToSearchParams({ q: undefined }).toString()).toBe('');
  });

  it('survives a parse → serialise → parse cycle', () => {
    const original = parseReportFilters(
      new URLSearchParams({ q: 'x', termId: ID, sortBy: 'name' }),
    );
    const round = parseReportFilters(filtersToSearchParams(original));
    expect(round).toEqual(original);
  });
});

describe('hasAnyFilter', () => {
  it('ignores sort and limit, which are not filters', () => {
    expect(hasAnyFilter({ sortBy: 'name', sortDir: 'asc', limit: 100 })).toBe(false);
  });

  it('detects a real filter', () => {
    expect(hasAnyFilter({ termId: ID })).toBe(true);
  });

  it('is false for an empty filter set', () => {
    expect(hasAnyFilter({})).toBe(false);
  });
});

describe('row sorting', () => {
  const rows = [
    { name: 'Charlie', score: 10, at: new Date('2026-03-01') },
    { name: 'alice', score: 30, at: new Date('2026-01-01') },
    { name: 'Bob', score: 20, at: new Date('2026-02-01') },
  ];
  const fallback = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

  it('sorts numbers ascending and descending', () => {
    expect(sortRows(rows, 'score', 'asc', fallback).map((r) => r.score)).toEqual([10, 20, 30]);
    expect(sortRows(rows, 'score', 'desc', fallback).map((r) => r.score)).toEqual([30, 20, 10]);
  });

  it('sorts strings case-insensitively via localeCompare', () => {
    expect(sortRows(rows, 'name', 'asc', fallback).map((r) => r.name)).toEqual([
      'alice',
      'Bob',
      'Charlie',
    ]);
  });

  it('sorts dates chronologically', () => {
    expect(sortRows(rows, 'at', 'asc', fallback).map((r) => r.name)).toEqual([
      'alice',
      'Bob',
      'Charlie',
    ]);
  });

  it('falls back to the natural order for an unknown column', () => {
    expect(sortRows(rows, 'nope', 'asc', fallback).map((r) => r.name)).toEqual([
      'alice',
      'Bob',
      'Charlie',
    ]);
  });

  it('falls back when no sort is requested', () => {
    expect(sortRows(rows, undefined, undefined, fallback).map((r) => r.name)).toEqual([
      'alice',
      'Bob',
      'Charlie',
    ]);
  });

  it('does not mutate the input array', () => {
    const input = [...rows];
    sortRows(input, 'score', 'desc', fallback);
    expect(input.map((r) => r.score)).toEqual([10, 30, 20]);
  });

  it('pushes null values to the end', () => {
    const withNulls = [{ v: 5 }, { v: null }, { v: 1 }];
    const sorted = sortRows(withNulls, 'v', 'asc', () => 0);
    expect(sorted[sorted.length - 1]!.v).toBeNull();
  });
});
