/**
 * `MAX_ATTEMPTS_REACHED` -> `Max attempts reached`.
 *
 * Lives in `lib` rather than beside the export code because the same
 * transformation is needed in the browser — a client component rendering a
 * status filter cannot import a module marked `server-only`, and duplicating
 * the function is how the two copies eventually disagree.
 */
export function humanise(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const lower = value.replace(/_/g, ' ').toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
