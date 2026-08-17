/**
 * The filter bar's URL contract.
 *
 * Filter state lives in the query string, so these functions decide what a
 * shared link contains, what the exporter receives, and whether "Clear all"
 * genuinely clears. The debounce guard is here too: the search box applies
 * itself as you type, and without `shouldCommit` it would navigate on every
 * settled keystroke — including ones that end up back where they started.
 */
import { describe, expect, it } from 'vitest';
import {
  commitValue,
  filterHref,
  nextSearchParams,
  shouldCommit,
} from '@/lib/utils/filterParams';

describe('committing a typed term', () => {
  it('trims surrounding whitespace', () => {
    expect(commitValue('  asha  ')).toBe('asha');
  });

  it('turns a whitespace-only term into nothing', () => {
    expect(commitValue('   ')).toBe('');
  });
});

describe('shouldCommit', () => {
  it('is true for a genuinely new term', () => {
    expect(shouldCommit('asha', '')).toBe(true);
    expect(shouldCommit('asha', 'ravi')).toBe(true);
  });

  it('is false once the term already matches the URL', () => {
    // Otherwise the debounce would re-navigate to the page already shown.
    expect(shouldCommit('asha', 'asha')).toBe(false);
  });

  it('ignores whitespace the user added around an unchanged term', () => {
    expect(shouldCommit('  asha  ', 'asha')).toBe(false);
  });

  it('is true when the box is cleared, so the filter is removed', () => {
    expect(shouldCommit('', 'asha')).toBe(true);
  });
});

describe('writing one filter into the query string', () => {
  it('sets a value', () => {
    expect(nextSearchParams('', 'batch', '2026').toString()).toBe('batch=2026');
  });

  it('replaces a value rather than appending a second copy', () => {
    expect(nextSearchParams('batch=2026', 'batch', '2027').toString()).toBe('batch=2027');
  });

  it('keeps the other filters, so controls compose', () => {
    const params = nextSearchParams('q=asha&userStatus=ACTIVE', 'batch', '2026');
    expect(params.get('q')).toBe('asha');
    expect(params.get('userStatus')).toBe('ACTIVE');
    expect(params.get('batch')).toBe('2026');
  });

  it('removes the key entirely when set back to "All"', () => {
    // A blank `?batch=` would still read as an applied filter downstream.
    const params = nextSearchParams('q=asha&batch=2026', 'batch', '');
    expect(params.has('batch')).toBe(false);
    expect(params.toString()).toBe('q=asha');
  });

  it('removes the key for a whitespace-only search term', () => {
    expect(nextSearchParams('q=asha', 'q', '   ').has('q')).toBe(false);
  });

  it('trims the value it writes', () => {
    expect(nextSearchParams('', 'q', '  asha  ').get('q')).toBe('asha');
  });

  it('leaves unrelated keys untouched, including ones it does not own', () => {
    const params = nextSearchParams('sortBy=name&sortDir=asc', 'q', 'asha');
    expect(params.get('sortBy')).toBe('name');
    expect(params.get('sortDir')).toBe('asc');
  });
});

describe('the href a filter change navigates to', () => {
  it('appends the query when filters are set', () => {
    expect(filterHref('/admin/students', new URLSearchParams('batch=2026'))).toBe(
      '/admin/students?batch=2026',
    );
  });

  it('drops the trailing "?" when the last filter is removed', () => {
    expect(filterHref('/admin/students', new URLSearchParams())).toBe('/admin/students');
  });

  it('clearing the only filter returns to the bare path', () => {
    const cleared = nextSearchParams('batch=2026', 'batch', '');
    expect(filterHref('/admin/students', cleared)).toBe('/admin/students');
  });
});
