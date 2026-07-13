/**
 * Validate loyalty card topology structure.
 */

/**
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology | null | undefined} topology
 */
export function validateLoyaltyCardTopology(topology) {
  /** @type {string[]} */
  const errors = [];
  if (!topology || typeof topology !== 'object') {
    return { valid: false, errors: ['topology_missing'] };
  }

  const rows = Number(topology.rows);
  const columns = Number(topology.columns);
  if (!Number.isFinite(rows) || rows <= 0) errors.push('invalid_rows');
  if (!Number.isFinite(columns) || columns <= 0) errors.push('invalid_columns');

  const cells = Array.isArray(topology.cells) ? topology.cells : [];
  if (cells.length === 0) errors.push('no_cells');

  const coordSet = new Set();
  let purchaseCount = 0;
  let rewardCount = 0;

  for (const cell of cells) {
    const r = Number(cell?.row);
    const c = Number(cell?.column);
    if (!Number.isFinite(r) || r < 0 || r >= rows) errors.push(`cell_row_out_of_range:${r}`);
    if (!Number.isFinite(c) || c < 0 || c >= columns) errors.push(`cell_column_out_of_range:${c}`);
    const key = `${r}:${c}`;
    if (coordSet.has(key)) errors.push(`duplicate_cell:${key}`);
    coordSet.add(key);
    if (cell.role === 'PURCHASE') purchaseCount += 1;
    if (cell.role === 'REWARD') rewardCount += 1;
  }

  if (purchaseCount < 1) errors.push('no_purchase_cells');
  if (rewardCount < 1) errors.push('no_reward_cells');

  const expectedCells = rows * columns;
  if (cells.length !== expectedCells && topology.source !== 'DEFAULT_TEMPLATE') {
    errors.push('cell_count_mismatch');
  }

  const conf = Number(topology.confidence);
  if (!Number.isFinite(conf) || conf < 0 || conf > 1) errors.push('invalid_confidence');

  const cycles = Array.isArray(topology.cycles) ? topology.cycles : [];
  for (const cycle of cycles) {
    const rewardIndexes = Array.isArray(cycle.rewardCellIndexes) ? cycle.rewardCellIndexes : [];
    if (rewardIndexes.length < 1) errors.push(`cycle_missing_reward:${cycle.rowIndex}`);
  }

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export default { validateLoyaltyCardTopology };
