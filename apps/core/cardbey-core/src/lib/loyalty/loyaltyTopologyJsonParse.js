/**
 * Safe JSON parsing for LLM topology / rules responses.
 */

import { parseLoyaltyCardTopologyFromOcr } from './loyaltyOcrTopologyParser.js';

const LLM_REFUSAL_RE =
  /\b(can'?t assist|cannot assist|as an ai|i'?m sorry|unable to help|not able to help)\b/i;

/**
 * @param {unknown} value
 * @returns {string | null}
 */
export function sanitizeLlmRewardText(value) {
  const s = String(value ?? '').trim();
  if (!s || LLM_REFUSAL_RE.test(s)) return null;
  return s;
}

/**
 * @param {string} raw
 */
export function stripLlmJsonFence(raw) {
  let cleaned = String(raw ?? '').trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start >= 0 && end > start) {
    cleaned = cleaned.slice(start, end + 1);
  }
  return cleaned;
}

/**
 * @param {string} text
 */
export function fallbackTopologyFromText(text) {
  const raw = String(text ?? '');
  const rowsMatch =
    raw.match(/"rows"\s*:\s*(\d{1,2})/i) ??
    raw.match(/\brows?\s*:\s*(\d{1,2})/i) ??
    raw.match(/\b(\d{1,2})\s*rows?\b/i);
  const colsMatch =
    raw.match(/"columns"\s*:\s*(\d{1,2})/i) ??
    raw.match(/\bcolumns?\s*:\s*(\d{1,2})/i) ??
    raw.match(/\b(\d{1,2})\s*col(?:umn)?s?\b/i);
  const rows = rowsMatch ? Number(rowsMatch[1]) : null;
  const columns = colsMatch ? Number(colsMatch[1]) : null;
  if (!rows || !columns) return null;

  /** @type {Record<string, unknown>} */
  const detected = {
    rows,
    columns,
    cells: [],
    overallConfidence: 0.45,
    footerText: null,
    purchaseItemHint: null,
    rewardItemHint: null,
  };

  const footer = raw.match(/"footerText"\s*:\s*"([^"]+)"/i);
  if (footer) detected.footerText = footer[1];

  return detected;
}

/**
 * @param {string} raw
 * @param {{ ocrText?: string | null; logLabel?: string }} [options]
 */
export function safeParseTopologyJson(raw, options = {}) {
  const cleaned = stripLlmJsonFence(raw);
  if (!cleaned) return null;

  const attempts = [
    cleaned,
    cleaned.replace(/,\s*([}\]])/g, '$1'),
    cleaned.replace(/'/g, '"'),
  ];

  for (const candidate of attempts) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      /* try next */
    }
  }

  const label = options.logLabel ?? 'Topology';
  if (process.env.LOYALTY_GRID_DEBUG === 'true' || process.env.NODE_ENV !== 'production') {
    console.warn(`[${label}] JSON parse failed, raw snippet:`, String(raw).slice(0, 500));
  }

  const fromSnippet = fallbackTopologyFromText(cleaned);
  if (fromSnippet) return fromSnippet;

  if (options.ocrText) {
    const ocrParsed = parseLoyaltyCardTopologyFromOcr(options.ocrText);
    if (ocrParsed?.detected) {
      return {
        ...ocrParsed.detected,
        purchaseItemHint: ocrParsed.purchaseItemHint,
        rewardItemHint: ocrParsed.rewardItemHint,
        overallConfidence: Number(ocrParsed.detected.overallConfidence) || 0.7,
      };
    }
  }

  return null;
}

/**
 * @param {string} raw
 * @param {{ logLabel?: string }} [options]
 */
export function safeParseRulesJson(raw, options = {}) {
  const cleaned = stripLlmJsonFence(raw);
  if (!cleaned) return null;

  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return sanitizeParsedLoyaltyRules(parsed);
    }
  } catch {
    const repaired = cleaned.replace(/,\s*([}\]])/g, '$1');
    try {
      const parsed = JSON.parse(repaired);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return sanitizeParsedLoyaltyRules(parsed);
      }
    } catch (err) {
      const label = options.logLabel ?? 'LoyaltyRules';
      if (process.env.LOYALTY_GRID_DEBUG === 'true' || process.env.NODE_ENV !== 'production') {
        console.warn(
          `[${label}] JSON parse failed:`,
          err instanceof Error ? err.message : err,
          String(raw).slice(0, 300),
        );
      }
    }
  }
  return null;
}

/**
 * @param {Record<string, unknown>} parsed
 */
function sanitizeParsedLoyaltyRules(parsed) {
  const next = { ...parsed };
  for (const key of ['rewardDescription', 'rewardItem', 'reward']) {
    if (key in next) {
      const clean = sanitizeLlmRewardText(next[key]);
      if (clean) next[key] = clean;
      else delete next[key];
    }
  }
  return next;
}
