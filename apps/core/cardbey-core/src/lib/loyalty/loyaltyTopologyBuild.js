/**
 * Convert detected grid topology → canonical LoyaltyCardTopology + cycles.
 * Delegates generic structure to DocumentTopologyEngine.
 */

import { buildDocumentTopologyFromDetected } from '../documentTopology/documentTopologyInference.js';
import { validateLoyaltyCardTopology } from './loyaltyTopologyValidation.js';

/**
 * @param {import('./loyaltyTopologyTypes.js').DetectedGridTopology} detected
 * @param {{ source?: import('./loyaltyTopologyTypes.js').LoyaltyTopologySource }} [opts]
 * @returns {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology | null}
 */
export function buildLoyaltyCardTopologyFromDetected(detected, opts = {}) {
  if (!detected || !Array.isArray(detected.cells) || detected.cells.length === 0) return null;

  const source = opts.source ?? 'VISION_EXTRACTED';
  const docTopology = buildDocumentTopologyFromDetected(detected, {
    documentType: 'LOYALTY_CARD',
    source,
  });
  if (!docTopology) return null;

  const rows = docTopology.rows;
  const columns = docTopology.columns;

  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardCell[]} */
  const cells = docTopology.cells.map((cell) => ({
    row: cell.row,
    column: cell.column,
    role: normalizeRole(cell.role),
    label: cell.label,
    confidence: cell.confidence,
  }));

  const cycles = buildCyclesFromCells(cells, rows, columns);
  const repeatedPattern = detected.repeatedPattern
    ? {
        direction: detected.repeatedPattern.direction === 'COLUMN' ? 'COLUMN' : 'ROW',
        sequence: (detected.repeatedPattern.roles ?? []).map(normalizeRole),
        repetitions: Math.max(1, Math.round(Number(detected.repeatedPattern.repetitions) || 1)),
      }
    : docTopology.repeatedPatterns?.[0]
      ? {
          direction: docTopology.repeatedPatterns[0].direction,
          sequence: docTopology.repeatedPatterns[0].sequence.map(normalizeRole),
          repetitions: docTopology.repeatedPatterns[0].repetitions,
        }
      : inferRepeatedPattern(cycles, rows, columns);

  const footerText =
    typeof detected.footerText === 'string'
      ? detected.footerText.trim() || undefined
      : docTopology.footer?.text;

  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology} */
  const topology = {
    ...docTopology,
    documentType: 'LOYALTY_CARD',
    source: /** @type {import('./loyaltyTopologyTypes.js').LoyaltyTopologySource} */ (source),
    cells,
    cycles,
    ...(repeatedPattern ? { repeatedPattern } : {}),
    footerText,
    templateVersion: 'topology-v2',
  };

  const validation = validateLoyaltyCardTopology(topology);
  if (!validation.valid) {
    topology.reviewRequired = true;
  }

  return topology;
}

/**
 * @param {string} role
 */
function normalizeRole(role) {
  const r = String(role ?? '').toUpperCase();
  if (r === 'PURCHASE' || r === 'REWARD' || r === 'DECORATIVE') return r;
  if (r === 'EMPTY' || r === 'TEXT' || r === 'IMAGE' || r === 'QR_CODE' || r === 'LOGO') return 'DECORATIVE';
  if (r === 'HEADER' || r === 'FOOTER') return 'DECORATIVE';
  return 'UNKNOWN';
}

/**
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyCardCell[]} cells
 * @param {number} rows
 * @param {number} columns
 */
function buildCyclesFromCells(cells, rows, columns) {
  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardCycle[]} */
  const cycles = [];
  for (let r = 0; r < rows; r++) {
    const rowCells = cells.filter((c) => c.row === r);
    const purchaseCells = rowCells.filter((c) => c.role === 'PURCHASE');
    const rewardCells = rowCells.filter((c) => c.role === 'REWARD');
    if (purchaseCells.length === 0 && rewardCells.length === 0) continue;
    cycles.push({
      rowIndex: r,
      purchaseCellCount: purchaseCells.length,
      rewardCellCount: rewardCells.length,
      rewardCellIndexes: rewardCells.map((c) => c.column),
    });
  }
  return cycles;
}

/**
 * Rebuild loyalty cycles after owner cell edits.
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology} topology
 */
export function rebuildLoyaltyCycles(topology) {
  if (!topology?.cells?.length) return topology;
  return {
    ...topology,
    cycles: buildCyclesFromCells(topology.cells, topology.rows, topology.columns),
  };
}

/**
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyCardCycle[]} cycles
 * @param {number} rows
 * @param {number} columns
 */
function inferRepeatedPattern(cycles, rows, columns) {
  if (cycles.length < 2) return undefined;
  const first = cycles[0];
  const allMatch = cycles.every(
    (c) =>
      c.purchaseCellCount === first.purchaseCellCount &&
      c.rewardCellCount === first.rewardCellCount &&
      JSON.stringify(c.rewardCellIndexes) === JSON.stringify(first.rewardCellIndexes),
  );
  if (!allMatch) return undefined;

  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCellRole[]} */
  const sequence = [];
  for (let c = 0; c < columns; c++) {
    if (first.rewardCellIndexes.includes(c)) sequence.push('REWARD');
    else if (c < first.purchaseCellCount + (first.rewardCellIndexes[0] ?? columns)) sequence.push('PURCHASE');
    else sequence.push('DECORATIVE');
  }
  return {
    direction: 'ROW',
    sequence,
    repetitions: rows,
  };
}

export default { buildLoyaltyCardTopologyFromDetected };
