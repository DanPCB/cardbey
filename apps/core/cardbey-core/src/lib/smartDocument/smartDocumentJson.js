/**
 * SQLite SmartDocument stores JSON-ish fields as String columns — serialize on write, parse on read.
 */

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function serializeSmartDocumentJsonField(value) {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

/**
 * @param {unknown} value
 * @param {object} [fallback]
 * @returns {object}
 */
export function parseSmartDocumentJsonField(value, fallback = {}) {
  if (value == null) return fallback;
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}
