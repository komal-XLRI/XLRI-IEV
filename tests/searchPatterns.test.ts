import { describe, expect, it } from 'vitest';
import { containsPattern, escapeRegex, exactPattern } from '@/lib/utils/regex';

/**
 * The matchers behind every search box and every value-list filter.
 *
 * They are built from user input and sent straight to Mongo, so the two things
 * that matter are that a metacharacter stays literal and that an "exact" match
 * is genuinely anchored — a filter that quietly matches prefixes reads as data
 * loss from the other side of the screen.
 */

describe('escapeRegex', () => {
  it('escapes every metacharacter that would change the match', () => {
    expect(new RegExp(escapeRegex('a.b')).test('a.b')).toBe(true);
    expect(new RegExp(escapeRegex('a.b')).test('axb')).toBe(false);
    expect(new RegExp(escapeRegex('c++')).test('c++')).toBe(true);
  });
});

describe('containsPattern', () => {
  it('matches anywhere in the value', () => {
    expect(containsPattern('eno').test('Zenobia')).toBe(true);
  });

  it('ignores case', () => {
    expect(containsPattern('ZENOBIA').test('Zenobia')).toBe(true);
    expect(containsPattern('zenobia').test('ZENOBIA')).toBe(true);
  });

  it('trims the term, so a stray space still matches', () => {
    expect(containsPattern('  Zenobia  ').test('Zenobia')).toBe(true);
  });

  it('treats a wildcard as literal text rather than "match everything"', () => {
    expect(containsPattern('.*').test('Zenobia')).toBe(false);
    expect(containsPattern('.*').test('a.*b')).toBe(true);
  });
});

describe('exactPattern', () => {
  it('matches the whole value only', () => {
    expect(exactPattern('2026').test('2026')).toBe(true);
    expect(exactPattern('2026').test('2026-27')).toBe(false);
    expect(exactPattern('202').test('2026')).toBe(false);
  });

  it('ignores case, for a batch typed one way and imported another', () => {
    expect(exactPattern('b2026').test('B2026')).toBe(true);
  });

  it('ignores padding a spreadsheet adds', () => {
    expect(exactPattern('  2026  ').test('2026')).toBe(true);
  });

  it('does not let a metacharacter widen the match', () => {
    expect(exactPattern('2.26').test('2026')).toBe(false);
    expect(exactPattern('2.26').test('2.26')).toBe(true);
  });
});
