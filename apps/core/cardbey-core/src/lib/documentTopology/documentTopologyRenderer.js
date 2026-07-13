/**
 * Generic topology grid renderer — document-type agnostic.
 */

/**
 * @typedef {{
 *   key: string;
 *   row: number;
 *   column: number;
 *   role: string;
 *   label?: string;
 *   completed?: boolean;
 *   active?: boolean;
 *   unlocked?: boolean;
 *   selected?: boolean;
 * }} RenderedTopologyCell
 */

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology} topology
 * @param {{
 *   filterRoles?: string[];
 *   cellState?: (cell: import('./documentTopologyTypes.js').DocumentCell) => Partial<RenderedTopologyCell>;
 * }} [opts]
 * @returns {RenderedTopologyCell[]}
 */
export function buildRenderedTopologyCells(topology, opts = {}) {
  if (!topology?.cells?.length) return [];
  const filterRoles = opts.filterRoles ?? null;
  const sorted = [...topology.cells].sort((a, b) => a.row - b.row || a.column - b.column);

  return sorted
    .filter((cell) => !filterRoles || filterRoles.includes(cell.role))
    .map((cell) => {
      const base = {
        key: `${cell.row}:${cell.column}`,
        row: cell.row,
        column: cell.column,
        role: cell.role,
        label: cell.label,
      };
      const extra = opts.cellState ? opts.cellState(cell) : {};
      return { ...base, ...extra };
    });
}

/**
 * @param {import('./documentTopologyTypes.js').DocumentTopology} topology
 */
export function topologyGridDimensions(topology) {
  return {
    rows: Math.max(1, topology?.rows ?? 1),
    columns: Math.max(1, topology?.columns ?? 1),
  };
}

/**
 * Group rendered cells by row index.
 * @param {RenderedTopologyCell[]} cells
 */
export function groupCellsByRow(cells) {
  /** @type {Map<number, RenderedTopologyCell[]>} */
  const map = new Map();
  for (const cell of cells) {
    const row = cell.row;
    if (!map.has(row)) map.set(row, []);
    map.get(row).push(cell);
  }
  for (const [, rowCells] of map) {
    rowCells.sort((a, b) => a.column - b.column);
  }
  return map;
}

export default {
  buildRenderedTopologyCells,
  topologyGridDimensions,
  groupCellsByRow,
};
