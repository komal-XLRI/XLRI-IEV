import { describe, expect, it } from 'vitest';
import { splitUpdate } from '@/lib/db/updateDoc';

/**
 * The rule every edit form in the admin depends on: an empty field clears the
 * value, an absent field is left alone. Folding those two together is how a
 * description somebody deleted comes back on the next page load.
 */
describe('splitUpdate', () => {
  it('sets a real value', () => {
    expect(splitUpdate({ name: 'Kirana Connect' })).toEqual({
      $set: { name: 'Kirana Connect' },
    });
  });

  it('unsets a field submitted empty', () => {
    // Not `$set: ''` — a blank string is a value, and every screen that prints
    // a dash for "not set" would show an empty gap instead.
    expect(splitUpdate({ tagline: '' })).toEqual({ $unset: { tagline: '' } });
  });

  it('treats whitespace as empty', () => {
    expect(splitUpdate({ tagline: '   ' })).toEqual({ $unset: { tagline: '' } });
  });

  it('ignores a field that was not on the form', () => {
    expect(splitUpdate({ tagline: undefined })).toEqual({});
  });

  it('carries null through, because "None" is a real choice', () => {
    expect(splitUpdate({ supportActivityId: null })).toEqual({
      $set: { supportActivityId: null },
    });
  });

  it('keeps numbers and booleans, including the falsy ones', () => {
    // 0 and false are answers. An earlier truthiness check here would drop
    // "0 credits" and "evidence not required".
    expect(splitUpdate({ credits: 0, evidenceRequired: false })).toEqual({
      $set: { credits: 0, evidenceRequired: false },
    });
  });

  it('splits a mixed update into both halves', () => {
    expect(splitUpdate({ name: 'New', area: '', missing: undefined })).toEqual({
      $set: { name: 'New' },
      $unset: { area: '' },
    });
  });

  it('returns an empty update when there is nothing to do', () => {
    // Must not become `{ $set: {} }`, which Mongo rejects.
    expect(splitUpdate({})).toEqual({});
  });
});
