export interface UsageCount {
  /** Singular noun, pluralised with a trailing "s", so keep it regular. */
  noun: string;
  count: number;
}

/**
 * The "still in use" half of a delete refusal: "4 assets and 2 requests", or null when nothing is.
 * Zero counts are dropped, so a caller can pass every relation unconditionally. Pure: the counting is the
 * caller's, because each reference has different relations and the queries stay typed that way.
 */
export function describeUsage(counts: UsageCount[]): string | null {
  const parts = counts
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.noun}${entry.count === 1 ? '' : 's'}`);
  if (parts.length === 0) return null;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
