import 'server-only';

/**
 * Turns an edit form's values into a Mongo update.
 *
 * A field submitted empty means "remove this", not "store a blank string".
 * `{ $set: { tagline: '' } }` leaves a value behind that every `value || '—'`
 * on every screen then treats as a real answer, and every `?? 'Not set'`
 * quietly stops working — so an empty string becomes `$unset` instead.
 *
 * `undefined` means the field was not on the form at all and is left alone,
 * which is what lets one dialog edit a subset of a record without wiping the
 * fields it never showed.
 *
 * `null` is passed through to `$set`: a select whose "None" option is a real
 * choice is saying something, not saying nothing.
 */
export function splitUpdate(input: Record<string, unknown>): Record<string, unknown> {
  const set: Record<string, unknown> = {};
  const unset: Record<string, ''> = {};

  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') unset[key] = '';
    else set[key] = value;
  }

  const update: Record<string, unknown> = {};
  if (Object.keys(set).length > 0) update.$set = set;
  if (Object.keys(unset).length > 0) update.$unset = unset;

  return update;
}
