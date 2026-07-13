/**
 * Stable topology hash for contract ↔ evidence graph invariants.
 */

import crypto from 'node:crypto';

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

/**
 * @param {import('../loyalty/loyaltyTopologyTypes.js').LoyaltyCardTopology | Record<string, unknown> | null | undefined} topology
 * @returns {string}
 */
export function computeTopologyHash(topology) {
  const topo = asObject(topology);
  if (!topo) return 'topology:empty';

  const cells = Array.isArray(topo.cells)
    ? topo.cells.map((cell) => {
        const row = asObject(cell);
        return {
          row: row?.row ?? null,
          column: row?.column ?? null,
          role: row?.role ?? null,
        };
      })
    : [];

  const payload = JSON.stringify({
    rows: topo.rows ?? null,
    columns: topo.columns ?? null,
    cells,
    cycles: Array.isArray(topo.cycles) ? topo.cycles : [],
  });

  return crypto.createHash('sha256').update(payload).digest('hex');
}
