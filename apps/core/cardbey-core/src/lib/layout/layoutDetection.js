/**
 * Shared layout type detection helpers.
 */

const TEXT_REPORT_SIGNALS = [
  /Executive Summary/i,
  /What Still Needs/i,
  /Capability Gap/i,
  /Gap\s+Priority/i,
  /\b(?:P0|P1|P2|P3)\b/,
  /(?:High|Medium|Low)\s*[—–-]/,
  /^(?:Execution|Memory|Reasoner|Planner|Learning|User Experience)\b/im,
  /Tool\s+Status\s+Action/i,
];

/**
 * True when a line is a markdown/metric table row — not regex alternation (a|b).
 * @param {string} line
 */
export function isMarkdownTableRow(line) {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;

  if (/\\[sSdDwWnrt]|(?:\?[:\=]|\(\?:)|\[\^|\\d\+|^\//.test(trimmed)) {
    return false;
  }

  const parts = trimmed
    .split('|')
    .map((p) => p.trim())
    .filter((cell, idx, arr) => !(idx === 0 && cell === '') && !(idx === arr.length - 1 && cell === ''));

  if (parts.length < 2 || parts.length > 6) return false;
  if (parts.every((p) => /^[-:]+$/.test(p))) return true;
  if (parts.some((p) => p.length > 100)) return false;

  const hasMetric = parts.some((p) => /^[$]?[\d,.]+%?$/.test(p) || /^[+-]?\d/.test(p));
  const hasHeader = parts.some((p) => /^(widget|value|trend|metric|kpi|name|tool|status|action)/i.test(p));
  const shortCells = parts.every((p) => p.length <= 60);

  return (hasMetric || hasHeader) && shortCells;
}

/** @param {string} content */
export function countMarkdownTableRows(content) {
  return content.split('\n').filter((l) => isMarkdownTableRow(l.trim())).length;
}

/** @param {string} content */
export function looksLikeCodeOrRegex(content) {
  const signals = [/\(\?:/, /\\s\+/, /\\d/, /\[\^\\s\]/, /\/(?:how|what)\s/i];
  return signals.filter((re) => re.test(content)).length >= 1;
}

/** @param {string} content */
export function scoreTextReport(content) {
  let score = 0;
  for (const re of TEXT_REPORT_SIGNALS) {
    if (re.test(content)) score += 1;
  }
  if (/^#{1,6}\s/m.test(content)) score += 1;
  return score;
}
