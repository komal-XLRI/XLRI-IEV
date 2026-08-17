/**
 * The rules behind the filter bar's URL synchronisation.
 *
 * Filter state lives in the query string, which is what lets an export
 * reproduce the screen and a filtered view be shared as a link. That makes
 * "what does this control write to the URL" a real contract rather than an
 * implementation detail — so it lives here, in plain functions, instead of
 * inside an event handler where it cannot be checked.
 */

/** What a typed search term becomes once committed. */
export function commitValue(raw: string): string {
  return raw.trim();
}

/**
 * Whether a draft is worth pushing to the URL.
 *
 * Guards the debounce: re-committing the value already in the URL would
 * navigate for no reason, and typing then deleting back to the original term
 * should settle silently rather than reload the page.
 */
export function shouldCommit(raw: string, committed: string): boolean {
  return commitValue(raw) !== committed;
}

/**
 * The query string after one filter changes.
 *
 * An empty value removes the key rather than writing `?batch=`, so "All" is
 * genuinely no filter — a blank parameter would still count as applied in the
 * chip row and would still be handed to the exporter.
 */
export function nextSearchParams(
  current: URLSearchParams | string,
  name: string,
  value: string,
): URLSearchParams {
  const params = new URLSearchParams(
    typeof current === 'string' ? current : current.toString(),
  );

  if (commitValue(value) === '') params.delete(name);
  else params.set(name, commitValue(value));

  return params;
}

/** Where a filter change navigates to, with no trailing `?` when nothing is set. */
export function filterHref(pathname: string, params: URLSearchParams): string {
  return params.size > 0 ? `${pathname}?${params}` : pathname;
}
