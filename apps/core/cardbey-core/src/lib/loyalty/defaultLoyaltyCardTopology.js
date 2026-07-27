/**
 * Explicit default loyalty card topology — 2×5 generic stamp card.
 */

import { Features } from '../../config/features.js';

/** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology} */
export const DEFAULT_LOYALTY_CARD_TOPOLOGY = {
  source: 'DEFAULT_TEMPLATE',
  rows: 2,
  columns: 5,
  cells: buildDefaultCells(2, 5, 10),
  cycles: [
    {
      rowIndex: 0,
      purchaseCellCount: 4,
      rewardCellCount: 1,
      rewardCellIndexes: [4],
    },
    {
      rowIndex: 1,
      purchaseCellCount: 4,
      rewardCellCount: 1,
      rewardCellIndexes: [4],
    },
  ],
  repeatedPattern: {
    direction: 'ROW',
    sequence: ['PURCHASE', 'PURCHASE', 'PURCHASE', 'PURCHASE', 'REWARD'],
    repetitions: 2,
  },
  confidence: 1,
  reviewRequired: false,
  templateVersion: 'default-2x5-v1',
};

/**
 * @param {number} rows
 * @param {number} cols
 * @param {number} purchaseCount
 */
function buildDefaultCells(rows, cols, purchaseCount) {
  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardCell[]} */
  const cells = [];
  let purchaseIdx = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isLastInRow = c === cols - 1;
      const role = isLastInRow ? 'REWARD' : purchaseIdx < purchaseCount ? 'PURCHASE' : 'DECORATIVE';
      if (role === 'PURCHASE') purchaseIdx += 1;
      cells.push({ row: r, column: c, role });
    }
  }
  return cells;
}

/**
 * @param {number} stampThreshold
 * @returns {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology}
 */
export function isDefaultTemplateFallbackEnabled() {
  return !Features.loyalty.disableDefaultTemplate;
}

/**
 * @param {string} [boundary]
 */
export function logDefaultTemplateBlocked(boundary = 'unknown') {
  console.warn('[LoyaltyContract] DEFAULT_TEMPLATE blocked', {
    boundary,
    flag: 'LOYALTY_DISABLE_DEFAULT_TEMPLATE',
  });
}

export function buildDefaultTopologyForThreshold(stampThreshold = 10) {
  if (!isDefaultTemplateFallbackEnabled()) {
    logDefaultTemplateBlocked('buildDefaultTopologyForThreshold');
    return null;
  }
  const purchases = Math.max(1, Math.round(stampThreshold));
  const cols = purchases <= 6 ? 3 : purchases <= 10 ? 5 : 6;
  const rows = Math.ceil(purchases / Math.max(1, cols - 1));
  const totalCells = rows * cols;

  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyCardCell[]} */
  const cells = [];
  const cycles = [];
  let purchasePlaced = 0;

  for (let r = 0; r < rows; r++) {
    const rewardCol = cols - 1;
    const rowPurchases = [];
    for (let c = 0; c < cols; c++) {
      let role = 'DECORATIVE';
      if (c === rewardCol) {
        role = 'REWARD';
      } else if (purchasePlaced < purchases) {
        role = 'PURCHASE';
        rowPurchases.push(c);
        purchasePlaced += 1;
      }
      cells.push({ row: r, column: c, role });
    }
    cycles.push({
      rowIndex: r,
      purchaseCellCount: rowPurchases.length,
      rewardCellCount: 1,
      rewardCellIndexes: [rewardCol],
    });
  }

  return {
    source: 'DEFAULT_TEMPLATE',
    rows,
    columns: cols,
    cells,
    cycles,
    confidence: 1,
    reviewRequired: false,
    templateVersion: 'default-threshold-v1',
  };
}

export default { DEFAULT_LOYALTY_CARD_TOPOLOGY, buildDefaultTopologyForThreshold };
