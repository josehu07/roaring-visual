/**
 * Tiny URL-query state helpers. State lives in React as usual; these helpers
 * read the current URL on mount and mirror state changes back via
 * `history.replaceState` so the URL is always a shareable snapshot.
 */

export function getInitialQuery(): URLSearchParams {
  if (typeof window === 'undefined') return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/**
 * Update the URL query string in place — only keys present in `changes` are
 * touched. A null/undefined/empty value deletes that key; any other string is
 * set. Uses `replaceState` so we don't grow the browser history.
 */
export function updateQuery(
  changes: Record<string, string | null | undefined>,
) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(changes)) {
    if (v == null || v === '') url.searchParams.delete(k);
    else url.searchParams.set(k, v);
  }
  const suffix = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, '', suffix);
}

/** Parse a query param as an integer within [min, max], or null if invalid. */
export function parseIntParam(
  q: URLSearchParams,
  key: string,
  min: number,
  max: number,
): number | null {
  const v = q.get(key);
  if (v == null) return null;
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return n;
}

/** Return `v` if it's in the allowed list, otherwise `fallback`. */
export function pickEnum<T extends string>(
  v: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  return v != null && (allowed as readonly string[]).includes(v)
    ? (v as T)
    : fallback;
}
