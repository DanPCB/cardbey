/**
 * Normalize evidence path-list fields that may arrive as a raw string or an
 * array containing unsplit strings. Splits on commas, newlines, or other
 * whitespace so the backend never silently concatenates multiple paths.
 */
export function normalizePathList(value: unknown): string[] {
  if (value === undefined || value === null) return [];

  if (Array.isArray(value)) {
    return value
      .flatMap((item) => normalizePathList(item))
      .filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}

/**
 * Normalize multiline text fields (e.g. reproduction steps). Preserves the
 * content of each line; only splits on explicit newlines.
 */
export function normalizeMultilineList(value: unknown): string[] {
  if (value === undefined || value === null) return [];

  if (Array.isArray(value)) {
    return value.map((s) => String(s).trim()).filter(Boolean);
  }

  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [];
}
