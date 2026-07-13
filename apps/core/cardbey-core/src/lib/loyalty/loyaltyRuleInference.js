/**
 * Deterministic loyalty business-rule inference from card topology.
 */

/**
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology} topology
 * @param {{ purchaseItem?: string; rewardItem?: string }} [hints]
 * @returns {import('./loyaltyTopologyTypes.js').LoyaltyProgramRule | null}
 */
export function inferRuleFromTopology(topology, hints = {}) {
  if (!topology || !Array.isArray(topology.cells) || topology.cells.length === 0) return null;

  const rowConsistency = inferPurchasesFromRepeatedRows(topology.cells);
  if (rowConsistency?.purchasesRequired > 0) {
    const rule = buildRule(
      rowConsistency.purchasesRequired,
      rowConsistency.rewardQuantity,
      hints,
      rowConsistency.cycleCount,
    );
    if (rowConsistency.reviewRequired) {
      rule.reviewRequired = true;
      rule.disagreements = rowConsistency.disagreements;
    }
    return rule;
  }

  const pattern = topology.repeatedPattern;
  if (pattern?.direction === 'ROW') {
    const roles = Array.isArray(pattern.roles)
      ? pattern.roles
      : Array.isArray(pattern.sequence)
        ? pattern.sequence
        : [];
    if (roles.length > 0) {
      const purchaseInSeq = roles.filter((r) => r === 'PURCHASE').length;
      const rewardInSeq = roles.filter((r) => r === 'REWARD').length;
      if (purchaseInSeq > 0 && rewardInSeq > 0) {
        return buildRule(purchaseInSeq, rewardInSeq, hints, pattern.repetitions);
      }
    }
  }

  const cycles = Array.isArray(topology.cycles) ? topology.cycles : [];
  if (cycles.length > 0) {
    const perCyclePurchases = cycles
      .map((cycle) => Number(cycle.purchaseCellCount))
      .filter((n) => Number.isFinite(n) && n > 0);
    const perCycleRewards = cycles
      .map((cycle) => Number(cycle.rewardCellCount))
      .filter((n) => Number.isFinite(n) && n > 0);
    const purchases = perCyclePurchases[0] ?? 0;
    const rewards = perCycleRewards[0] ?? 1;
    const purchasesConsistent = perCyclePurchases.every((n) => n === purchases);
    const rewardsConsistent = perCycleRewards.every((n) => n === rewards);
    if (purchases > 0 && rewards > 0 && purchasesConsistent && rewardsConsistent) {
      return buildRule(purchases, rewards, hints, cycles.length);
    }
  }

  const byRow = groupCellsByRow(topology.cells);
  const rowKeys = [...byRow.keys()].sort((a, b) => a - b);
  if (rowKeys.length > 0) {
    const rowStats = rowKeys.map((rowKey) => {
      const row = byRow.get(rowKey) ?? [];
      const sorted = [...row].sort((a, b) => Number(a.column) - Number(b.column));
      const rewardIdx = sorted.findIndex((c) => c.role === 'REWARD');
      if (rewardIdx < 1) return null;
      const purchases = sorted.slice(0, rewardIdx).filter((c) => c.role === 'PURCHASE').length;
      const rewards = sorted.slice(rewardIdx).filter((c) => c.role === 'REWARD').length;
      return purchases > 0 && rewards > 0 ? { purchases, rewards } : null;
    }).filter(Boolean);

    if (rowStats.length > 0) {
      const first = rowStats[0];
      const consistent = rowStats.every(
        (s) => s.purchases === first.purchases && s.rewards === first.rewards,
      );
      if (consistent) {
        return buildRule(first.purchases, first.rewards, hints, rowStats.length);
      }
      const rule = buildRule(first.purchases, first.rewards, hints, rowStats.length);
      rule.reviewRequired = true;
      rule.disagreements = ['Repeated row purchase/reward pattern is inconsistent'];
      return rule;
    }
  }

  return null;
}

/**
 * Derive per-row purchases-before-reward; never use total reward cells as threshold.
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyCardCell[]} cells
 */
function inferPurchasesFromRepeatedRows(cells) {
  const byRow = groupCellsByRow(cells);
  const rowKeys = [...byRow.keys()].sort((a, b) => a - b);
  if (!rowKeys.length) return null;

  /** @type {{ purchases: number; rewards: number }[]} */
  const rowStats = [];
  for (const rowKey of rowKeys) {
    const row = [...(byRow.get(rowKey) ?? [])].sort((a, b) => Number(a.column) - Number(b.column));
    const rewardIdx = row.findIndex((c) => c.role === 'REWARD');
    if (rewardIdx < 1) continue;
    const purchases = row.slice(0, rewardIdx).filter((c) => c.role === 'PURCHASE').length;
    const rewards = row.slice(rewardIdx).filter((c) => c.role === 'REWARD').length;
    if (purchases > 0 && rewards > 0) rowStats.push({ purchases, rewards });
  }
  if (!rowStats.length) return null;

  const first = rowStats[0];
  const disagreements = [];
  const consistent = rowStats.every((s) => {
    if (s.purchases !== first.purchases) {
      disagreements.push('Row purchase counts differ across repeated rows');
      return false;
    }
    if (s.rewards !== first.rewards) {
      disagreements.push('Row reward counts differ across repeated rows');
      return false;
    }
    return true;
  });

  return {
    purchasesRequired: first.purchases,
    rewardQuantity: first.rewards,
    cycleCount: rowStats.length,
    reviewRequired: !consistent,
    disagreements,
  };
}

/**
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyCardCell[]} cells
 */
function groupCellsByRow(cells) {
  /** @type {Map<number, import('./loyaltyTopologyTypes.js').LoyaltyCardCell[]>} */
  const map = new Map();
  for (const cell of cells) {
    const r = Number(cell.row);
    if (!map.has(r)) map.set(r, []);
    map.get(r).push(cell);
  }
  return map;
}

function pickString(...values) {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return '';
}

/**
 * @param {number} purchasesRequired
 * @param {number} rewardQuantity
 * @param {{ purchaseItem?: string; rewardItem?: string }} hints
 * @param {number} [cycleCount]
 */
function buildRule(purchasesRequired, rewardQuantity, hints, cycleCount) {
  const purchaseItem = pickString(hints.purchaseItem, 'Purchase');
  const rewardItem = pickString(hints.rewardItem, 'Reward');
  /** @type {import('./loyaltyTopologyTypes.js').LoyaltyProgramRule} */
  const rule = {
    programType: 'STAMP_CARD',
    purchaseItem,
    purchasesRequired: Math.max(1, Math.round(purchasesRequired)),
    rewardQuantity: Math.max(1, Math.round(rewardQuantity)),
    rewardItem,
    repeatMode: 'INDEFINITE',
  };
  if (Number.isFinite(cycleCount) && cycleCount > 1) {
    rule.fixedCardCycles = Math.round(cycleCount);
  }
  return rule;
}

/**
 * Resolve stamp threshold for legacy fields from rule (never total purchase cells).
 * @param {import('./loyaltyTopologyTypes.js').LoyaltyProgramRule | null | undefined} rule
 */
export function purchasesRequiredFromRule(rule) {
  const n = Number(rule?.purchasesRequired);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export default { inferRuleFromTopology, purchasesRequiredFromRule };
