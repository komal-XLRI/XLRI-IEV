/** Escapes a user-supplied search term so it is matched literally. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive "contains" matcher for a free-text search box. */
export function containsPattern(value: string): RegExp {
  return new RegExp(escapeRegex(value.trim()), 'i');
}
