/**
 * Validate generic document topology structure.
 */

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology | null | undefined} topology
 */
export function validateDocumentTopology(topology) {
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
  let hasMeaningful = false;
  for (const cell of cells) {
    const r = Number(cell?.row);
    const c = Number(cell?.column);
    if (!Number.isFinite(r) || r < 0 || r >= rows) errors.push(`cell_row_out_of_range:${r}`);
    if (!Number.isFinite(c) || c < 0 || c >= columns) errors.push(`cell_column_out_of_range:${c}`);
    const key = `${r}:${c}`;
    if (coordSet.has(key)) errors.push(`duplicate_cell:${key}`);
    coordSet.add(key);
    if (cell.role && cell.role !== 'UNKNOWN' && cell.role !== 'EMPTY') hasMeaningful = true;
  }

  if (!hasMeaningful) errors.push('no_meaningful_cells');

  const conf = Number(topology.confidence);
  if (!Number.isFinite(conf) || conf < 0 || conf > 1) errors.push('invalid_confidence');

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

export default { validateDocumentTopology };
