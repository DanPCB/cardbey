/**
 * Canonical suburb label for storage and aggregation (trim + title case per word).
 * @param {unknown} value
 * @returns {string | null}
 */
export function normalizeSuburbLabel(value) {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return null;
  return trimmed
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(' ');
}
