/**
 * Structured GPT-4o vision grid extraction for loyalty stamp cards.
 * Counts rows × columns visually (ChatGPT-style) instead of linear OCR token counting.
 */

import { getVisionEngine } from '../../ai/engines/index.js';
import { buildLoyaltyCardTopologyFromDetected } from './loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from './loyaltyRuleInference.js';
import { validateLoyaltyCardTopology } from './loyaltyTopologyValidation.js';
import { emitLoyaltyTopologyTelemetry } from './loyaltyTopologyTelemetry.js';
import { buildDetectedGridFromMatrix } from './loyaltyOcrTopologyParser.js';
import { safeParseTopologyJson } from './loyaltyTopologyJsonParse.js';

export const EXTRACTION_METHOD_GPT_GRID_VISION = 'gpt4o_grid_vision';

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeRole(role) {
  const r = String(role ?? '').toUpperCase();
  if (r === 'REWARD' || r === 'FREE' || r === 'GIFT') return 'REWARD';
  if (r === 'PURCHASE' || r === 'STAMP' || r === 'COFFEE') return 'PURCHASE';
  if (r === 'DECORATIVE' || r === 'EMPTY') return r;
  return 'UNKNOWN';
}

function inferColumnsFromRawCells(rawCells, fallbackColumns) {
  if (!Array.isArray(rawCells) || rawCells.length === 0) return fallbackColumns;
  let maxSpan = Number(fallbackColumns) || 0;
  /** @type {Map<number, number>} */
  const perRow = new Map();
  for (const cell of rawCells) {
    const row = Number(cell.row);
    const col = Number(cell.column);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
    perRow.set(row, Math.max(perRow.get(row) ?? 0, col + 1));
  }
  for (const width of perRow.values()) {
    maxSpan = Math.max(maxSpan, width);
  }
  return maxSpan > 0 ? maxSpan : fallbackColumns;
}

/**
 * When the model declares more columns than repeatedPattern.roles, extend with PURCHASE slots.
 *
 * @param {number} columns
 * @param {string[]} roles
 */
export function reconcilePatternRoles(columns, roles) {
  /** @type {string[]} */
  const normalized = (Array.isArray(roles) ? roles : [])
    .map(normalizeRole)
    .filter((role) => role === 'PURCHASE' || role === 'REWARD');
  if (!normalized.length) {
    const purchases = Math.max(1, columns - 1);
    return {
      columns,
      roles: [...Array(purchases).fill('PURCHASE'), 'REWARD'],
    };
  }

  const purchaseCount = normalized.filter((role) => role === 'PURCHASE').length;
  const rewardCount = normalized.filter((role) => role === 'REWARD').length;
  const patternWidth = purchaseCount + rewardCount;
  const nextColumns = Math.max(columns, patternWidth);
  const nextRoles = [...normalized];

  if (nextColumns > patternWidth) {
    const rewardIdx = nextRoles.findIndex((role) => role === 'REWARD');
    const insertAt = rewardIdx >= 0 ? rewardIdx : nextRoles.length;
    for (let i = 0; i < nextColumns - patternWidth; i++) {
      nextRoles.splice(insertAt, 0, 'PURCHASE');
    }
  }

  return { columns: nextColumns, roles: nextRoles };
}

/**
 * @param {Array<Record<string, unknown>>} rawCells
 * @param {number} rows
 * @param {number} columns
 * @param {string[]} patternRoles
 */
function padCellsToFullGrid(rawCells, rows, columns, patternRoles) {
  /** @type {Map<string, Record<string, unknown>>} */
  const byKey = new Map();
  for (const cell of rawCells) {
    const row = Number(cell.row);
    const col = Number(cell.column);
    if (!Number.isFinite(row) || !Number.isFinite(col)) continue;
    byKey.set(`${row}:${col}`, cell);
  }

  const roles =
    patternRoles?.length === columns
      ? patternRoles
      : [...Array(Math.max(1, columns - 1)).fill('PURCHASE'), 'REWARD'];

  /** @type {Array<Record<string, unknown>>} */
  const cells = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const existing = byKey.get(`${row}:${col}`);
      const patternRole = normalizeRole(roles[col] ?? (col === columns - 1 ? 'REWARD' : 'PURCHASE'));
      const role = patternRole === 'REWARD' ? 'REWARD' : 'PURCHASE';
      cells.push({
        row,
        column: col,
        role,
        text: pickString(existing?.text, existing?.label) || undefined,
        confidence: Number(existing?.confidence) || 0.88,
      });
    }
  }
  return cells;
}

/**
 * Build full cell matrix when the model returns rows/columns/pattern but sparse cells.
 *
 * @param {Record<string, unknown>} parsed
 */
export function expandVisionGridCells(parsed) {
  const rows = Number(parsed.rows);
  const columns = Number(parsed.columns);
  if (!Number.isFinite(rows) || !Number.isFinite(columns) || rows <= 0 || columns <= 0) {
    return null;
  }

  const rawCells = Array.isArray(parsed.cells) ? parsed.cells : [];
  const pattern = parsed.repeatedPattern;
  const initialRoles = Array.isArray(pattern?.roles) ? pattern.roles.map(normalizeRole) : [];
  const resolvedColumns = Math.max(
    columns,
    inferColumnsFromRawCells(rawCells, columns),
    initialRoles.length,
  );
  const reconciled = reconcilePatternRoles(
    resolvedColumns,
    initialRoles.length
      ? initialRoles
      : [...Array(Math.max(1, resolvedColumns - 1)).fill('PURCHASE'), 'REWARD'],
  );
  const roles = reconciled.roles;

  const sharedMeta = {
    footerText: pickString(parsed.footerText) ?? undefined,
    purchaseItemHint: pickString(parsed.purchaseItemHint, 'Coffee'),
    rewardItemHint: pickString(parsed.rewardItemHint, 'Free'),
    overallConfidence: Number(parsed.overallConfidence) || 0.88,
  };

  const repeatedPattern = {
    direction: 'ROW',
    roles,
    repetitions: rows,
    confidence: Number(pattern?.confidence) || sharedMeta.overallConfidence,
  };

  if (rawCells.length >= rows * reconciled.columns * 0.75 && rawCells.length > 0) {
    return {
      rows,
      columns: reconciled.columns,
      cells: padCellsToFullGrid(
        rawCells.map((cell, idx) => ({
          ...cell,
          row: Number(cell.row ?? Math.floor(idx / reconciled.columns)),
          column: Number(cell.column ?? idx % reconciled.columns),
        })),
        rows,
        reconciled.columns,
        roles,
      ),
      repeatedPattern,
      ...sharedMeta,
    };
  }

  let purchasesPerRow = roles.filter((role) => role === 'PURCHASE').length;
  let freePerRow = roles.filter((role) => role === 'REWARD').length;
  if (purchasesPerRow < 1) purchasesPerRow = Math.max(1, reconciled.columns - 1);
  if (freePerRow < 1) freePerRow = 1;

  return buildDetectedGridFromMatrix(rows, purchasesPerRow, freePerRow, {
    purchaseLabel: sharedMeta.purchaseItemHint,
    rewardLabel: sharedMeta.rewardItemHint,
    footerText: sharedMeta.footerText,
    confidence: sharedMeta.overallConfidence,
  });
}

/**
 * @param {string} raw
 */
export function parseLoyaltyCardGridVisionJson(raw) {
  const parsed = safeParseTopologyJson(raw, { logLabel: 'LoyaltyGridVision' });
  if (!parsed || typeof parsed !== 'object') return null;
  const detected = expandVisionGridCells(parsed);
  if (!detected) return null;
  return {
    detected,
    ocrText: pickString(parsed.ocrText) ?? null,
    rawParsed: parsed,
  };
}

/**
 * @param {{ cardTopology?: { rows?: number; columns?: number; confidence?: number } | null; extractionMethod?: string | null; confidence?: number }} result
 */
export function isStrongGptGridVisionResult(result) {
  if (!result?.cardTopology?.rows || !result?.cardTopology?.columns) return false;
  const method = String(result.extractionMethod ?? '');
  if (!method.includes('gpt4o_grid_vision') && !method.includes('grid_vision')) return false;
  const conf = Math.max(
    Number(result.cardTopology.confidence) || 0,
    Number(result.confidence) || 0,
  );
  return conf >= 0.8;
}

/**
 * @param {{ imageUrl: string; missionId?: string | null; storeId?: string | null }} input
 */
export async function extractLoyaltyCardGridFromVision(input = {}) {
  const imageUrl = pickString(input.imageUrl);
  if (!imageUrl) {
    return { ok: false, reason: 'IMAGE_REQUIRED' };
  }

  emitLoyaltyTopologyTelemetry('loyalty_grid_vision_started', {
    missionId: input.missionId ?? null,
    storeId: input.storeId ?? null,
  });

  let visionRaw = null;
  try {
    const vision = getVisionEngine();
    visionRaw = await vision.analyzeImage({ imageUrl, task: 'loyalty_card_grid' });
  } catch (err) {
    emitLoyaltyTopologyTelemetry('loyalty_grid_vision_failed', {
      missionId: input.missionId ?? null,
      storeId: input.storeId ?? null,
      reason: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, reason: 'vision_failed', error: err };
  }

  const parsed = parseLoyaltyCardGridVisionJson(visionRaw?.text ?? '');
  if (!parsed?.detected) {
    emitLoyaltyTopologyTelemetry('loyalty_grid_vision_failed', {
      missionId: input.missionId ?? null,
      storeId: input.storeId ?? null,
      reason: 'parse_failed',
    });
    return { ok: false, reason: 'parse_failed', visionRaw };
  }

  const cardTopology = buildLoyaltyCardTopologyFromDetected(parsed.detected, {
    source: 'VISION_EXTRACTED',
  });
  if (!cardTopology) {
    return { ok: false, reason: 'topology_build_failed', visionRaw };
  }

  const validation = validateLoyaltyCardTopology(cardTopology);
  const confidence = Math.max(
    Number(parsed.detected.overallConfidence) || 0,
    Number(cardTopology.confidence) || 0,
  );

  const rule = inferRuleFromTopology(cardTopology, {
    purchaseItem: parsed.detected.purchaseItemHint,
    rewardItem: parsed.detected.rewardItemHint,
  });

  emitLoyaltyTopologyTelemetry('loyalty_grid_vision_completed', {
    missionId: input.missionId ?? null,
    storeId: input.storeId ?? null,
    rows: cardTopology.rows,
    columns: cardTopology.columns,
    purchasesRequired: rule?.purchasesRequired ?? null,
    confidence,
    valid: validation.valid,
  });

  return {
    ok: true,
    cardTopology,
    rule,
    detected: parsed.detected,
    ocrText: parsed.ocrText,
    extractionMethod: EXTRACTION_METHOD_GPT_GRID_VISION,
    confidence,
    visionRaw,
    validation,
  };
}

export default {
  EXTRACTION_METHOD_GPT_GRID_VISION,
  extractLoyaltyCardGridFromVision,
  parseLoyaltyCardGridVisionJson,
  expandVisionGridCells,
  reconcilePatternRoles,
  isStrongGptGridVisionResult,
};
