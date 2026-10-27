type Fields = Record<string, unknown> | null;

const show = (value: unknown) =>
  value === undefined || value === null ? '-' : typeof value === 'object' ? JSON.stringify(value) : String(value);

/** One line per field an audit row changed, in the order the fields were recorded. */
export function describeChange(before: unknown, after: unknown): string[] {
  const was = (before ?? null) as Fields;
  const now = (after ?? null) as Fields;
  const keys = [...new Set([...Object.keys(was ?? {}), ...Object.keys(now ?? {})])];
  return keys.map((key) => `${key}: ${show(was?.[key])} -> ${show(now?.[key])}`);
}
