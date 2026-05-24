/** @param {unknown} val */
export function parseJsonBlob(val) {
  if (val == null) return null;
  if (typeof val === 'object' && !Array.isArray(val)) return val;
  if (typeof val === 'string') {
    try {
      const o = JSON.parse(val);
      return typeof o === 'object' && o && !Array.isArray(o) ? o : null;
    } catch {
      return null;
    }
  }
  return null;
}
