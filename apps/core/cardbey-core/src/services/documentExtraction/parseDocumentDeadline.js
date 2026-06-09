// DANH: skill-round6-document
/**
 * Best-effort deadline/date parsing for flyer text (ISO, ranges, month spans).
 */

/**
 * @param {string | null | undefined} dateStr
 * @returns {Date | null}
 */
export function parseDocumentDeadline(dateStr) {
  const s = String(dateStr ?? '').trim();
  if (!s) return null;

  // Explicit ISO YYYY-MM-DD (or datetime prefix)
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = new Date(s);
    if (!Number.isNaN(iso.getTime())) return iso;
  }

  // "Aug 11-15, 2026" or "Aug 11–15, 2026"
  const rangeMatch = s.match(/(\w+\s+\d+)[,–\-].*?(\d{4})/);
  if (rangeMatch) {
    const d = new Date(`${rangeMatch[1]}, ${rangeMatch[2]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // "July/August 2026" → last month in range (August 1)
  const monthRangeMatch = s.match(/(\w+)\/(\w+)\s+(\d{4})/i);
  if (monthRangeMatch) {
    const d = new Date(`${monthRangeMatch[2]} 1, ${monthRangeMatch[3]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // "August 2026" or "Aug 2026"
  const monthYearMatch = s.match(/^(\w+)\s+(\d{4})$/);
  if (monthYearMatch) {
    const d = new Date(`${monthYearMatch[1]} 1, ${monthYearMatch[2]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // "Aug 11, 2026" single date
  const singleMatch = s.match(/^(\w+\s+\d{1,2}),?\s+(\d{4})$/);
  if (singleMatch) {
    const d = new Date(`${singleMatch[1]}, ${singleMatch[2]}`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  // Last resort: first 4-digit year anywhere in string
  const yearOnly = s.match(/(\d{4})/);
  if (yearOnly) {
    const d = new Date(`${yearOnly[1]}-12-31`);
    if (!Number.isNaN(d.getTime())) return d;
  }

  return null;
}
