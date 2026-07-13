/**
 * Bounded loyalty contract diagnostics — no OCR text or full topology arrays.
 */

/** @typedef {import('./loyaltyTopologyTypes.js').LoyaltyCardTopology} LoyaltyCardTopology */
/** @typedef {import('./loyaltyTopologyTypes.js').LoyaltyProgramRule} LoyaltyProgramRule */

const AUTHORITATIVE_TOPOLOGY_SOURCES = new Set([
  'VISION_EXTRACTED',
  'OWNER_DEFINED',
  'OWNER_CONFIRMED',
  'MATRIX_SPEC',
  'FUSION_VISUAL_OCR',
]);

/**
 * @param {LoyaltyCardTopology | null | undefined} topology
 */
export function hasAuthoritativeLoyaltyTopology(topology) {
  if (!topology || typeof topology !== 'object') return false;
  const source = String(topology.source ?? '').trim();
  if (source === 'DEFAULT_TEMPLATE') return false;
  const rows = Number(topology.rows);
  const columns = Number(topology.columns);
  const cells = Array.isArray(topology.cells) ? topology.cells : [];
  return rows > 0 && columns > 0 && cells.length > 0 && (AUTHORITATIVE_TOPOLOGY_SOURCES.has(source) || source.length > 0);
}

/**
 * @param {LoyaltyCardTopology | null | undefined} topology
 */
export function countTopologyCells(topology) {
  const cells = Array.isArray(topology?.cells) ? topology.cells : [];
  const purchaseCells = cells.filter((c) => c?.role === 'PURCHASE').length;
  const rewardCells = cells.filter((c) => c?.role === 'REWARD').length;
  return {
    totalCells: cells.length,
    purchaseCells,
    rewardCells,
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} draft
 */
export function summarizeLoyaltyContract(draft = {}, extra = {}) {
  const rule = draft?.rule && typeof draft.rule === 'object' ? draft.rule : null;
  const cardTopology =
    draft?.cardTopology && typeof draft.cardTopology === 'object' ? draft.cardTopology : null;
  const counts = countTopologyCells(cardTopology);
  const hasRule = Boolean(rule && Number(rule.purchasesRequired) > 0);
  const hasCardTopology = hasAuthoritativeLoyaltyTopology(cardTopology);
  const rendererMode = hasCardTopology ? 'TOPOLOGY_DRIVEN' : 'DEFAULT_TEMPLATE';

  return {
    traceId: extra.traceId ?? null,
    missionId: extra.missionId ?? draft?.missionId ?? null,
    storeId: extra.storeId ?? draft?.storeId ?? null,
    attachmentId: extra.attachmentId ?? draft?.attachmentId ?? null,
    evidenceId: extra.evidenceId ?? draft?.evidenceId ?? null,
    sourceMode: extra.sourceMode ?? draft?.sourceMode ?? null,
    boundary: extra.boundary ?? null,
    hasRule,
    purchasesRequired: hasRule ? Number(rule.purchasesRequired) : null,
    hasCardTopology,
    topologySource: cardTopology?.source ?? null,
    rows: cardTopology?.rows ?? null,
    columns: cardTopology?.columns ?? null,
    totalCells: counts.totalCells || null,
    purchaseCells: counts.purchaseCells || null,
    rewardCells: counts.rewardCells || null,
    legacyStampThreshold:
      Number(draft?.stampThreshold ?? draft?.requiredStamps ?? draft?.stampsRequired) || null,
    rendererMode,
    fallbackReason: extra.fallbackReason ?? (hasCardTopology ? null : 'CARD_TOPOLOGY_MISSING'),
  };
}

/**
 * @param {string} boundary
 * @param {Record<string, unknown>} draft
 * @param {Record<string, unknown>} [extra]
 */
export function logLoyaltyContractDiagnostic(boundary, draft = {}, extra = {}) {
  if (process.env.NODE_ENV === 'production' && process.env.LOYALTY_CONTRACT_DEBUG !== 'true') {
    return summarizeLoyaltyContract(draft, { ...extra, boundary });
  }
  const summary = summarizeLoyaltyContract(draft, { ...extra, boundary });
  console.info('[LoyaltyContract]', summary);
  return summary;
}

/**
 * Align legacy scalar fields with canonical rule — never use total cell counts.
 * @param {Record<string, unknown>} draft
 */
export function alignLegacyFieldsWithCanonicalRule(draft = {}) {
  const out = { ...(draft && typeof draft === 'object' ? draft : {}) };
  const rule = out.rule && typeof out.rule === 'object' ? out.rule : null;
  const purchasesRequired = Number(rule?.purchasesRequired);
  if (!Number.isFinite(purchasesRequired) || purchasesRequired < 1) {
    return out;
  }
  out.requiredStamps = purchasesRequired;
  out.stampThreshold = purchasesRequired;
  const purchaseItem = String(rule.purchaseItem ?? 'Coffee').trim() || 'Coffee';
  const rewardItem = String(rule.rewardItem ?? out.reward ?? 'Reward').trim() || 'Reward';
  out.reward = rewardItem;
  out.rewardRule = `Collect ${purchasesRequired} ${purchaseItem} · Get ${rule.rewardQuantity ?? 1} ${rewardItem}`;
  return out;
}

/**
 * @param {Record<string, unknown>} draft
 */
export function detectLoyaltyContractConflict(draft = {}) {
  const rule = draft?.rule && typeof draft.rule === 'object' ? draft.rule : null;
  const canonical = Number(rule?.purchasesRequired);
  const legacy = Number(draft?.stampThreshold ?? draft?.requiredStamps ?? draft?.stampsRequired);
  if (!Number.isFinite(canonical) || canonical < 1 || !Number.isFinite(legacy) || legacy < 1) {
    return null;
  }
  if (canonical === legacy) return null;
  return {
    code: 'LOYALTY_CONTRACT_CONFLICT',
    canonicalThreshold: canonical,
    legacyThreshold: legacy,
    message: `LOYALTY_CONTRACT_CONFLICT: canonical threshold ${canonical} ignored conflicting legacy threshold ${legacy}`,
  };
}

export default {
  hasAuthoritativeLoyaltyTopology,
  countTopologyCells,
  summarizeLoyaltyContract,
  logLoyaltyContractDiagnostic,
  alignLegacyFieldsWithCanonicalRule,
  detectLoyaltyContractConflict,
};
