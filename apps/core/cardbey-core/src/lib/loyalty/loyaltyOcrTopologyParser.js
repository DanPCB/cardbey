/**
 * Deterministic loyalty card grid extraction from OCR text.
 * Runs before LLM topology inference so repeated stamp rows (e.g. 7× Coffee + Free × 4 rows)
 * produce authoritative VISION_EXTRACTED topology without DEFAULT_TEMPLATE fallback.
 */

import { inferLoyaltyStampGridFromOcr } from '../intake/attachmentAnalysis.js';
import { buildLoyaltyCardTopologyFromDetected } from './loyaltyTopologyBuild.js';

const FOOTER_LINE_RE =
  /\b(catering\s+available|thank\s+you|terms|conditions|valid\s+at|expires?)\b/i;

const PURCHASE_TOKEN_RE = /\b(coffee|tea|latte|espresso|drink|purchase|stamp|visit)\b/i;
const REWARD_TOKEN_RE = /\b(free|reward|complimentary)\b/i;

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

/**
 * @param {string} raw
 * @returns {string | null}
 */
export function extractOcrFooterText(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (FOOTER_LINE_RE.test(line) && !/\bfree\b/i.test(line.replace(/catering/i, ''))) {
      return line;
    }
  }

  const catering = text.match(/\b(catering\s+available)\b/i);
  if (catering) return catering[1];

  return null;
}

/**
 * @param {string} line
 */
function isFooterOnlyLine(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed) return true;
  if (FOOTER_LINE_RE.test(trimmed) && !PURCHASE_TOKEN_RE.test(trimmed)) return true;
  return false;
}

/**
 * @param {string} line
 * @returns {{ purchases: number; rewards: number; purchaseLabel: string | null; rewardLabel: string | null } | null}
 */
export function parseStampRowLine(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed || isFooterOnlyLine(trimmed)) return null;

  const tokens = trimmed.match(/\b[\w']+\b/g) ?? [];
  if (!tokens.length) return null;

  let purchases = 0;
  let rewards = 0;
  let purchaseLabel = null;
  let rewardLabel = null;

  for (const token of tokens) {
    if (REWARD_TOKEN_RE.test(token) && !/^coffee$/i.test(token)) {
      rewards += 1;
      rewardLabel = rewardLabel ?? token;
      continue;
    }
    if (PURCHASE_TOKEN_RE.test(token)) {
      purchases += 1;
      purchaseLabel = purchaseLabel ?? token;
    }
  }

  if (purchases < 1 || rewards < 1) return null;
  // Multiple reward tokens on one line → flat OCR stream, not a single stamp row.
  if (rewards > 1) return null;
  return { purchases, rewards, purchaseLabel, rewardLabel };
}

/**
 * @param {number} rows
 * @param {number} purchasesPerRow
 * @param {number} freePerRow
 * @param {{ purchaseLabel?: string | null; rewardLabel?: string | null; footerText?: string | null; confidence?: number }} [opts]
 */
export function buildDetectedGridFromMatrix(rows, purchasesPerRow, freePerRow, opts = {}) {
  const columns = purchasesPerRow + freePerRow;
  /** @type {import('./loyaltyTopologyTypes.js').DetectedGridTopology['cells']} */
  const cells = [];
  const purchaseLabel = opts.purchaseLabel ?? 'Coffee';
  const rewardLabel = opts.rewardLabel ?? 'Free';

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const isReward = col >= purchasesPerRow;
      cells.push({
        row,
        column: col,
        role: isReward ? 'REWARD' : 'PURCHASE',
        text: isReward ? rewardLabel : purchaseLabel,
        confidence: opts.confidence ?? 0.88,
      });
    }
  }

  return {
    rows,
    columns,
    cells,
    repeatedPattern: {
      direction: 'ROW',
      roles: [...Array(purchasesPerRow).fill('PURCHASE'), ...Array(freePerRow).fill('REWARD')],
      repetitions: rows,
      confidence: opts.confidence ?? 0.88,
    },
    footerText: opts.footerText ?? undefined,
    purchaseItemHint: purchaseLabel,
    rewardItemHint: rewardLabel,
    overallConfidence: opts.confidence ?? 0.88,
  };
}

/**
 * @param {string} body
 */
function parseGridFromOcrLines(body) {
  const lines = String(body ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isFooterOnlyLine(line));

  /** @type {ReturnType<typeof parseStampRowLine>[]} */
  const rowStats = [];
  for (const line of lines) {
    const stats = parseStampRowLine(line);
    if (stats) rowStats.push(stats);
  }

  if (!rowStats.length) return null;

  const first = rowStats[0];
  const consistent = rowStats.every(
    (row) => row.purchases === first.purchases && row.rewards === first.rewards,
  );
  if (!consistent || !first) return null;

  return buildDetectedGridFromMatrix(rowStats.length, first.purchases, first.rewards, {
    purchaseLabel: first.purchaseLabel,
    rewardLabel: first.rewardLabel,
    confidence: rowStats.length >= 2 ? 0.92 : 0.84,
  });
}

/**
 * @param {string} body
 */
function parseGridFromOcrTokens(body) {
  const tokens = [];
  const re = /\b(coffee|free|tea|latte|espresso)\b/gi;
  let match;
  while ((match = re.exec(body))) {
    tokens.push(match[1].toLowerCase());
  }
  if (tokens.length < 8) return null;

  const coffeeCount = tokens.filter((t) => t === 'coffee' || t === 'tea' || t === 'latte' || t === 'espresso').length;
  const freeCount = tokens.filter((t) => t === 'free').length;

  if (freeCount >= 1 && coffeeCount >= freeCount * 2) {
    const rows = freeCount;
    const purchasesPerRow = coffeeCount / rows;
    if (Number.isInteger(purchasesPerRow) && purchasesPerRow >= 2) {
      return buildDetectedGridFromMatrix(rows, purchasesPerRow, 1, {
        purchaseLabel: tokens.includes('coffee') ? 'Coffee' : 'Purchase',
        rewardLabel: 'Free',
        confidence: rows >= 2 ? 0.9 : 0.82,
      });
    }
  }

  for (const unitLen of [8, 10, 9, 11, 12, 6, 7]) {
    if (tokens.length % unitLen !== 0) continue;
    const rowCount = tokens.length / unitLen;
    const unit = tokens.slice(0, unitLen);
    if (unit[unitLen - 1] !== 'free') continue;

    let repeats = true;
    for (let r = 1; r < rowCount; r++) {
      const slice = tokens.slice(r * unitLen, (r + 1) * unitLen);
      if (slice.some((t, i) => t !== unit[i])) {
        repeats = false;
        break;
      }
    }
    if (!repeats) continue;

    const purchasesPerRow = unit.filter((t) => t !== 'free').length;
    const freePerRow = unit.filter((t) => t === 'free').length;
    if (purchasesPerRow >= 2 && freePerRow >= 1) {
      return buildDetectedGridFromMatrix(rowCount, purchasesPerRow, freePerRow, {
        purchaseLabel: 'Coffee',
        rewardLabel: 'Free',
        confidence: 0.91,
      });
    }
  }

  return null;
}

/**
 * Parse OCR text into a detected loyalty grid topology.
 *
 * @param {string | null | undefined} ocrText
 * @returns {{
 *   detected: import('./loyaltyTopologyTypes.js').DetectedGridTopology;
 *   method: string;
 *   purchaseItemHint: string;
 *   rewardItemHint: string;
 * } | null}
 */
export function parseLoyaltyCardTopologyFromOcr(ocrText) {
  const raw = String(ocrText ?? '').trim();
  if (!raw || raw === '(no text detected)') return null;

  const footerText = extractOcrFooterText(raw);
  const body = footerText
    ? raw.replace(new RegExp(footerText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), '').trim()
    : raw;

  const fromLines = parseGridFromOcrLines(body);
  if (fromLines) {
    return {
      detected: { ...fromLines, footerText: footerText ?? fromLines.footerText },
      method: 'ocr_stamp_row_lines',
      purchaseItemHint: pickString(fromLines.purchaseItemHint, 'Coffee'),
      rewardItemHint: pickString(fromLines.rewardItemHint, 'Free'),
    };
  }

  const fromTokens = parseGridFromOcrTokens(body);
  if (fromTokens) {
    return {
      detected: { ...fromTokens, footerText: footerText ?? fromTokens.footerText },
      method: 'ocr_token_repetition',
      purchaseItemHint: pickString(fromTokens.purchaseItemHint, 'Coffee'),
      rewardItemHint: pickString(fromTokens.rewardItemHint, 'Free'),
    };
  }

  const gridInference = inferLoyaltyStampGridFromOcr(raw);
  const matrix = gridInference?.matrix;
  if (matrix?.rows && matrix.purchasesPerRow) {
    const detected = buildDetectedGridFromMatrix(
      matrix.rows,
      matrix.purchasesPerRow,
      matrix.freePerRow ?? 1,
      {
        purchaseLabel: 'Coffee',
        rewardLabel: pickString(gridInference.reward, 'Free'),
        footerText,
        confidence: Number(gridInference.confidence) || 0.8,
      },
    );
    return {
      detected: { ...detected, footerText: footerText ?? detected.footerText },
      method: String(gridInference.inferredFrom ?? 'ocr_stamp_grid_lines'),
      purchaseItemHint: 'Coffee',
      rewardItemHint: pickString(gridInference.reward, 'Free'),
    };
  }

  return null;
}

/**
 * Parse OCR semantics from an evidence graph.
 *
 * @param {import('../evidence/missionEvidenceGraphService.js').UnifiedEvidenceGraph | Record<string, unknown>} graph
 * @param {Record<string, unknown>} [ctx]
 */
export function parseFromGraph(graph, ctx = {}) {
  const meta = ctx.metadata ?? {};
  const attachmentAnalysis =
    meta.attachmentAnalysis && typeof meta.attachmentAnalysis === 'object'
      ? meta.attachmentAnalysis
      : null;
  const preseeded =
    meta.preseededDraft && typeof meta.preseededDraft === 'object' ? meta.preseededDraft : null;
  const intakeEvidence =
    meta.intakeEvidence && typeof meta.intakeEvidence === 'object' ? meta.intakeEvidence : null;

  const ocrText = pickString(
    graph.semanticText?.ocrText,
    attachmentAnalysis?.ocrText,
    attachmentAnalysis?.preseededDraft?.ocrText,
    preseeded?.ocrText,
    intakeEvidence?.ocrText,
    intakeEvidence?.snapshot?.ocrText,
    meta.intakeOcrText,
  );

  if (!ocrText) {
    return {
      source: 'none',
      confidence: 0,
      rows: null,
      columns: null,
      detectedLayout: null,
      stampThreshold: null,
      buyGetRule: null,
      footerText: null,
      cardTopology: null,
    };
  }

  const footerText = extractOcrFooterText(ocrText);
  const collectMatch = ocrText.match(/\bcollect\s+(\d{1,2})\s*(visit|stamp|purchase)/i);
  const buyGetMatch = ocrText.match(/\b(\d{1,2})\s*(?:visit|stamp|purchase)s?\s*[-–]\s*get\s+(\d{1,2})/i);
  const stampMatch = ocrText.match(/\b(\d{1,2})\s*(stamps?|visits?|purchases?)\b/i);

  let stampThreshold = collectMatch
    ? Number(collectMatch[1])
    : stampMatch
      ? Number(stampMatch[1])
      : null;
  const buyGetRule = buyGetMatch
    ? { buy: Number(buyGetMatch[1]), get: Number(buyGetMatch[2]) }
    : collectMatch
      ? { buy: Number(collectMatch[1]), get: 1 }
      : null;
  if (buyGetRule?.buy) stampThreshold = buyGetRule.buy;

  const parsed = parseLoyaltyCardTopologyFromOcr(ocrText);
  if (parsed?.detected) {
    const cardTopology = buildLoyaltyCardTopologyFromDetected(parsed.detected, {
      source: 'VISION_EXTRACTED',
    });
    return {
      source: parsed.method,
      confidence: Number(cardTopology?.confidence) || 0.82,
      rows: parsed.detected.rows ?? null,
      columns: parsed.detected.columns ?? null,
      detectedLayout:
        parsed.detected.rows && parsed.detected.columns
          ? `${parsed.detected.rows}x${parsed.detected.columns}`
          : null,
      stampThreshold,
      buyGetRule,
      footerText,
      purchaseItemHint: parsed.purchaseItemHint,
      rewardItemHint: parsed.rewardItemHint,
      cardTopology,
    };
  }

  const gridInference = inferLoyaltyStampGridFromOcr(ocrText);
  if (gridInference) {
    const matrix = gridInference.matrix;
    return {
      source: String(gridInference.inferredFrom ?? 'ocr_semantic'),
      confidence: Number(gridInference.confidence) || 0.65,
      rows: matrix?.rows ?? null,
      columns: matrix ? matrix.purchasesPerRow + (matrix.freePerRow ?? 1) : null,
      detectedLayout:
        matrix?.rows && matrix?.purchasesPerRow
          ? `${matrix.rows}x${matrix.purchasesPerRow + (matrix.freePerRow ?? 1)}`
          : null,
      stampThreshold: stampThreshold ?? (Number(gridInference.requiredStamps) || null),
      buyGetRule,
      footerText,
      purchaseItemHint: 'Coffee',
      rewardItemHint: pickString(gridInference.reward, 'Reward'),
      cardTopology: null,
    };
  }

  return {
    source: 'ocr_text_only',
    confidence: stampThreshold ? 0.62 : 0.35,
    rows: null,
    columns: null,
    detectedLayout: null,
    stampThreshold,
    buyGetRule,
    footerText,
    purchaseItemHint: null,
    rewardItemHint: null,
    cardTopology: null,
  };
}
