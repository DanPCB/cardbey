/**
 * Store headline / visible text fix detection for Performer code_fix bridge.
 * Pure string logic — no LLM — so tests and callers stay lightweight.
 */

/**
 * Patterns that indicate the user wants to change store-visible text/content,
 * not fix a software bug.
 */
const STORE_CONTENT_FIX_PATTERNS = [
  /\bhero\s*(section|headline|title|heading|text|copy)\b/i,
  /\bheadline\b/i,
  /\bh1\b|\bh2\b/i,
  /\btagline\b/i,
  /\bsubheadline\b/i,
  /\bstore\s*(name|title|heading)\b/i,
  /\bbanner\s*(text|title|heading)\b/i,
  /\bsection\s*(title|heading|text)\b/i,
  /\bwording\b|\bspelling\b|\btypo\b/i,
  /\bchange\s+.{0,40}\bto\b/i,
  /\bfix\s+.{0,40}\bto\b/i,
  /\breplace\s+.{0,40}\bwith\b/i,
  /\bupdate\s+.{0,40}(text|label|title|name)\b/i,
];

/**
 * Patterns that strongly indicate a source code / software bug, not a text edit.
 */
const SOURCE_CODE_SIGNALS = [
  /\bbug\b|\bregression\b|\bcrash\b/i,
  /\bfunction\b|\bmethod\b|\bclass\b|\bimport\b/i,
  /\bapi\b|\broute\b|\bendpoint\b/i,
  /\bnull\s*(ref|pointer|check)\b/i,
  /\btype\s*error\b|\bruntime\s*error\b/i,
  /\btest\s*fail\b|\bunit\s*test\b/i,
  /\bconsole\s*\.\s*(error|warn|log)\b/i,
  /\bstack\s*trace\b|\bexception\b/i,
  /\bundefined\s+is\s+not\b/i,
  /\bhero\s*image\b/i,
  /\bchange.*image\b/i,
  /\bswap.*image\b/i,
  /\breplace.*image\b/i,
  /\bupload.*image\b/i,
  /\bnew.*image\b/i,
  /\bdifferent.*image\b/i,
  /\bimage.*change\b/i,
];

/** Single-token "old" fragments that are not real content (regex false positives). */
const AMBIGUOUS_OLD_VALUES = new Set([
  'the',
  'a',
  'an',
  'my',
  'this',
  'that',
  'it',
  'your',
  'our',
  'their',
  'its',
]);

/**
 * @param {string} raw
 * @returns {string}
 */
function sanitizeStoreContentOldValue(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed.length < 2) return '';
  if (AMBIGUOUS_OLD_VALUES.has(trimmed.toLowerCase())) return '';
  return trimmed;
}

/**
 * Prefer quoted or trailing "to …" / "with …" phrase for the new headline/text.
 * @param {string} description
 * @returns {string}
 */
function extractStoreContentNewValue(description) {
  const s = String(description ?? '').trim();
  if (!s) return '';

  let m = /\bto\s+['"]([^'"]+)['"]/i.exec(s);
  if (m) return m[1].trim();

  m = /["']([^"']+)["']\s+to\s+["']([^'"]+)["']/i.exec(s);
  if (m) return m[2].trim();

  m = /\bto\s+(.+)$/i.exec(s);
  if (m) {
    return m[1]
      .trim()
      .replace(/[.!?,;:]+$/g, '')
      .trim();
  }

  m = /\bwith\s+['"]([^'"]+)['"]/i.exec(s);
  if (m) return m[1].trim();

  m = /\bwith\s+(.+)$/i.exec(s);
  if (m) {
    return m[1]
      .trim()
      .replace(/[.!?,;:]+$/g, '')
      .trim();
  }

  m = /\bfrom\s+['"]([^'"]+)['"]\s+to\s+['"]([^'"]+)['"]/i.exec(s);
  if (m) return m[2].trim();

  m = /\bfrom\s+[^\n]+?\s+to\s+['"]([^'"]+)['"]/i.exec(s);
  if (m) return m[1].trim();

  return '';
}

/**
 * Optional old text when the user explicitly named it (replace/from/quoted pair).
 * @param {string} description
 * @param {string} newValue
 * @returns {string}
 */
function extractStoreContentOldValue(description, newValue) {
  const s = String(description ?? '').trim();
  let oldValue = '';

  let m = /replace\s+['"]([^'"]+)['"]\s+with/i.exec(s);
  if (m) oldValue = m[1].trim();
  else {
    m = /replace\s+(\S+)\s+with\b/i.exec(s);
    if (m) oldValue = m[1].trim();
  }

  if (!oldValue) {
    m = /["']([^"']+)["']\s+to\s+["']([^'"]+)["']/i.exec(s);
    if (m && (!newValue || m[2].trim() === newValue.trim())) {
      oldValue = m[1].trim();
    }
  }

  if (!oldValue) {
    m = /\bfrom\s+['"]([^'"]+)['"]\s+to\s+['"]([^'"]+)['"]/i.exec(s);
    if (m && (!newValue || m[2].trim() === newValue.trim())) {
      oldValue = m[1].trim();
    }
  }

  if (!oldValue) {
    m =
      /(?:fix|change|update|replace)\s+["']?([^"'\n]+?)["']?\s+(?:headline\s+)?(?:on\s+\S+\s+section\s+)?to\s+["']?([^"'\n]+?)["']?(?:\s|$)/i.exec(
        s,
      );
    if (m?.[1] && m?.[2] && (!newValue || m[2].trim() === newValue.trim())) {
      oldValue = m[1].trim();
    }
  }

  return sanitizeStoreContentOldValue(oldValue);
}

/**
 * Detect whether the request is a store content/text fix (not a source code bug).
 *
 * @param {string} description
 * @param {string[]} filePaths - caller-supplied file paths
 * @returns {{ isContentFix: boolean, oldValue: string, newValue: string, field: string }}
 */
export function detectStoreContentFix(description, filePaths) {
  const hasSourceFilePaths = filePaths.some((p) =>
    /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb|php)$/i.test(p),
  );
  if (hasSourceFilePaths) {
    return { isContentFix: false, oldValue: '', newValue: '', field: '' };
  }

  const desc = String(description ?? '');

  const hasSourceSignal = SOURCE_CODE_SIGNALS.some((re) => re.test(desc));
  if (hasSourceSignal) {
    return { isContentFix: false, oldValue: '', newValue: '', field: '' };
  }

  const hasContentSignal = STORE_CONTENT_FIX_PATTERNS.some((re) => re.test(desc));
  if (!hasContentSignal) {
    return { isContentFix: false, oldValue: '', newValue: '', field: '' };
  }

  let newValue = extractStoreContentNewValue(desc);
  let oldValue = extractStoreContentOldValue(desc, newValue);

  if (!newValue) {
    const fallbackPatterns = [
      /replace\s+["']?([^"'\n]{2,120}?)["']?\s+with\s+["']?([^"'\n]{2,120}?)["']?(?:\s|$)/i,
      /from\s+["']?([^"'\n]{2,120}?)["']?\s+to\s+["']?([^"'\n]{2,120}?)["']?(?:\s|$)/i,
      /["']([^"']+)["']\s+to\s+["']([^"']+)["']/i,
    ];
    for (const re of fallbackPatterns) {
      const m = desc.match(re);
      if (m?.[1] && m?.[2]) {
        oldValue = sanitizeStoreContentOldValue(m[1].trim());
        newValue = m[2].trim();
        break;
      }
    }
  }

  const dl = desc.toLowerCase();
  const field =
    /\bsubheadline\b|\bh2\b|\btagline\b/.test(dl) ? 'heroSubtitle' :
    /\bheadline\b|\bh1\b|\bhero/.test(dl) ? 'heroTitle' :
    /\bbanner\b/.test(dl) ? 'bannerText' :
    'heroTitle';

  return { isContentFix: true, oldValue, newValue, field };
}
