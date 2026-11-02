/**
 * Parse optional consultation timestamps. Missing and explicit null values
 * both map to SQL NULL; invalid supplied values return undefined.
 */
export function parseOptionalTimestamp(
  value: unknown,
): string | null | undefined {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.trim() === "") return undefined;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : undefined;
}
