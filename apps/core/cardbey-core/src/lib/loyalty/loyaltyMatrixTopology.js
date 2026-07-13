/**
 * Compact stamp-card matrix specs → canonical cardTopology + rule.
 * Priority: vision grid topology → owner topology → structured matrix spec → default template.
 * OCR line heuristics must NOT override authoritative topology.
 */

import { inferRuleFromTopology } from './loyaltyRuleInference.js';
import {
  alignLegacyFieldsWithCanonicalRule,
  hasAuthoritativeLoyaltyTopology,
} from './loyaltyContractDiagnostics.js';

/**
 * Explicit matrix parser contract.
 * Supported:
 * - 4x(7+1)  → 4 rows, 7 purchases + 1 reward per row
 * - rows=4 purchases=7 rewards=1
 * - 4 rows, 7 purchases + 1 reward
 * - 4x8      → 4 rows × 8 total cells (7 purchase + 1 reward when reward at end)
 *
 * @param {string | null | undefined} input
 * @returns {{ rows: number; purchasesPerRow: number; freePerRow: number; source?: string } | null}
 */
export function parseStampMatrixSpec(input) {
  const s = String(input ?? '').trim();
  if (!s) return null;

  const grouped = s.match(/(\d+)\s*[x×]\s*\(\s*(\d+)\s*\+\s*(\d+)\s*\)/i);
  if (grouped) {
    const rows = Number(grouped[1]);
    const purchasesPerRow = Number(grouped[2]);
    const freePerRow = Number(grouped[3]);
    if (rows > 0 && purchasesPerRow > 0 && freePerRow >= 0) {
      return { rows, purchasesPerRow, freePerRow, source: 'MATRIX_SPEC' };
    }
  }

  const kv = s.match(
    /rows\s*=\s*(\d+)(?:\D+)(?:purchases?|stamps?)\s*=\s*(\d+)(?:\D+)(?:rewards?|free)\s*=\s*(\d+)/i,
  );
  if (kv) {
    const rows = Number(kv[1]);
    const purchasesPerRow = Number(kv[2]);
    const freePerRow = Number(kv[3]);
    if (rows > 0 && purchasesPerRow > 0 && freePerRow >= 0) {
      return { rows, purchasesPerRow, freePerRow, source: 'MATRIX_SPEC' };
    }
  }

  const verbose = s.match(
    /(\d+)\s*rows?,?\s+(\d+)\s*(?:purchases?|stamps?|coffee)\s*\+\s*(\d+)\s*(?:rewards?|free)/i,
  );
  if (verbose) {
    const rows = Number(verbose[1]);
    const purchasesPerRow = Number(verbose[2]);
    const freePerRow = Number(verbose[3]);
    if (rows > 0 && purchasesPerRow > 0 && freePerRow >= 0) {
      return { rows, purchasesPerRow, freePerRow, source: 'MATRIX_SPEC' };
    }
  }

  const totalCells = s.match(/(\d+)\s*[x×]\s*(\d+)(?!\s*[+(\d])/i);
  if (totalCells) {
    const rows = Number(totalCells[1]);
    const columns = Number(totalCells[2]);
    if (rows > 0 && columns > 1) {
      return {
        rows,
        purchasesPerRow: columns - 1,
        freePerRow: 1,
        source: 'MATRIX_SPEC',
      };
    }
  }

  return null;
}

/**
 * @param {{
 *   rows: number;
 *   purchasesPerRow: number;
 *   freePerRow?: number;
 *   footerText?: string | null;
 *   purchaseLabel?: string | null;
 *   rewardLabel?: string | null;
 *   source?: string;
 *   confidence?: number;
 *   reviewRequired?: boolean;
 * }} spec
 * @returns {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology}
 */
export function buildMatrixStampCardTopology(spec = {}) {
  const rows = Math.max(1, Math.round(Number(spec.rows) || 1));
  const purchasesPerRow = Math.max(1, Math.round(Number(spec.purchasesPerRow) || 1));
  const freePerRow = Math.max(0, Math.round(Number(spec.freePerRow ?? 1)));
  const columns = purchasesPerRow + freePerRow;
  const source = spec.source ?? 'MATRIX_SPEC';

  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardCell[]} */
  const cells = [];
  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardCycle[]} */
  const cycles = [];
  const sequence = [
    ...Array(purchasesPerRow).fill('PURCHASE'),
    ...Array(freePerRow).fill('REWARD'),
  ];

  for (let r = 0; r < rows; r++) {
    const rewardCellIndexes = [];
    for (let c = 0; c < columns; c++) {
      const isReward = c >= purchasesPerRow;
      const role = isReward ? 'REWARD' : 'PURCHASE';
      if (isReward) rewardCellIndexes.push(c);
      cells.push({
        row: r,
        column: c,
        role,
        ...(spec.purchaseLabel && role === 'PURCHASE' ? { label: spec.purchaseLabel } : {}),
        ...(spec.rewardLabel && role === 'REWARD' ? { label: spec.rewardLabel } : {}),
      });
    }
    cycles.push({
      rowIndex: r,
      purchaseCellCount: purchasesPerRow,
      rewardCellCount: freePerRow,
      rewardCellIndexes,
    });
  }

  return {
    source,
    rows,
    columns,
    cells,
    cycles,
    repeatedPattern: {
      direction: 'ROW',
      sequence,
      repetitions: rows,
    },
    footerText: spec.footerText ?? undefined,
    confidence: Number(spec.confidence) || 0.85,
    reviewRequired: Boolean(spec.reviewRequired),
    templateVersion: 'matrix-spec-v1',
  };
}

/**
 * @param {{ rows: number; purchasesPerRow: number; freePerRow?: number }} matrix
 */
export function formatStampMatrixSpec(matrix) {
  const rows = Math.max(1, Math.round(Number(matrix.rows) || 1));
  const purchasesPerRow = Math.max(1, Math.round(Number(matrix.purchasesPerRow) || 1));
  const freePerRow = Math.max(0, Math.round(Number(matrix.freePerRow ?? 1)));
  return `${rows}x(${purchasesPerRow}+${freePerRow})`;
}

/**
 * Attach matrix topology only when no authoritative topology exists.
 * Never override VISION_EXTRACTED / OWNER_DEFINED topology with OCR heuristics.
 *
 * @param {Record<string, unknown>} draft
 * @param {{ userMessage?: string | null; purchaseItem?: string | null; rewardItem?: string | null; source?: string; forceMatrix?: { rows: number; purchasesPerRow: number; freePerRow: number } | null }} [hints]
 */
export function enrichLoyaltyDraftWithMatrixTopology(draft = {}, hints = {}) {
  const out = { ...(draft && typeof draft === 'object' ? draft : {}) };
  if (hasAuthoritativeLoyaltyTopology(out.cardTopology)) {
    return alignLegacyFieldsWithCanonicalRule(out);
  }

  /** @type {{ rows: number; purchasesPerRow: number; freePerRow: number } | null} */
  let matrix = hints.forceMatrix ?? null;
  if (!matrix && hints.userMessage) {
    matrix = parseStampMatrixSpec(hints.userMessage);
  }
  if (!matrix && out.stampMatrix) {
    matrix = parseStampMatrixSpec(String(out.stampMatrix));
  }
  if (!matrix && out.matrix && typeof out.matrix === 'object') {
    const rows = Number(out.matrix.rows);
    const purchasesPerRow = Number(out.matrix.purchasesPerRow);
    const freePerRow = Number(out.matrix.freePerRow ?? 1);
    if (rows > 0 && purchasesPerRow > 0) {
      matrix = { rows, purchasesPerRow, freePerRow: freePerRow >= 0 ? freePerRow : 1 };
    }
  }

  if (!matrix) return out;

  const purchaseItem =
    String(hints.purchaseItem ?? out.purchaseItem ?? 'Coffee').trim() || 'Coffee';
  const rewardItem =
    String(hints.rewardItem ?? out.reward ?? out.rewardRule ?? 'Reward').trim() || 'Reward';

  const cardTopology = buildMatrixStampCardTopology({
    ...matrix,
    footerText: out.cardFooterText ?? out.cardTopology?.footerText ?? null,
    purchaseLabel: purchaseItem,
    rewardLabel: rewardItem,
    source: hints.source ?? matrix.source ?? 'MATRIX_SPEC',
    confidence: Number(out.confidence) || 0.85,
    reviewRequired: Boolean(out.topologyReviewRequired),
  });
  const rule = inferRuleFromTopology(cardTopology, { purchaseItem, rewardItem });

  out.cardTopology = cardTopology;
  out.matrix = matrix;
  out.stampMatrix = formatStampMatrixSpec(matrix);
  out.layoutSource = cardTopology.source;
  out.layoutConfidence = cardTopology.confidence;
  if (rule) {
    out.rule = rule;
  }
  return alignLegacyFieldsWithCanonicalRule(out);
}

export default {
  parseStampMatrixSpec,
  buildMatrixStampCardTopology,
  formatStampMatrixSpec,
  enrichLoyaltyDraftWithMatrixTopology,
};
