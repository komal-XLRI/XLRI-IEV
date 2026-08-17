/** Escapes a user-supplied search term so it is matched literally. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" matcher for a free-text search box. */
export function containsPattern(value: string): RegExp {
  return new RegExp(escapeRegex(value.trim()), 'i');
}

/**
 * Case-insensitive whole-value matcher, for a stored value chosen from a list.
 *
 * A batch or a cluster is typed by hand on one screen and imported from a
 * spreadsheet on another, so "2026" and "2026 " and "b2026" vs "B2026" all
 * reach the database. Anchoring keeps it an equality test — "2026" must not
 * also match "2026-27" — while ignoring the case and padding that a CSV brings.
 */
export function exactPattern(value: string): RegExp {
  return new RegExp(`^${escapeRegex(value.trim())}$`, 'i');
}
