/**
 * Canonical runtime execution draft for topology nodes.
 * Attachment analysis is immutable evidence — never use attachmentAnalysis.missingFields
 * after owner input is merged into executionDraft.
 */

function pickString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function normalizeTopologyAction(raw) {
  const action = String(raw ?? '')
    .trim()
    .toUpperCase();
  if (!action) return null;
  if (action === 'SIMPLIFIED') return 'USE_SIMPLIFIED';
  return action;
}

/**
 * @param {Record<string, unknown> | null | undefined} ownerInput
 * @returns {Record<string, unknown>}
 */
export function normalizeOwnerInputFields(ownerInput) {
  const owner = ownerInput && typeof ownerInput === 'object' ? ownerInput : {};
  const next = {};
  if (typeof owner.reward === 'string' && owner.reward.trim()) {
    next.reward = owner.reward.trim();
    next.rewardRule = owner.reward.trim();
  }
  if (owner.stampThreshold != null || owner.requiredStamps != null) {
    const n = Number(owner.stampThreshold ?? owner.requiredStamps);
    if (Number.isFinite(n) && n > 0) {
      next.stampThreshold = n;
      next.requiredStamps = n;
    }
  }
  if (typeof owner.programName === 'string' && owner.programName.trim()) {
    next.programName = owner.programName.trim();
    next.name = owner.programName.trim();
  }
  for (const [key, value] of Object.entries(owner)) {
    if (key in next) continue;
    if (value == null) continue;
    if (key === 'rule' || key === 'cardTopology') {
      if (value && typeof value === 'object') next[key] = value;
      continue;
    }
    if (typeof value === 'string' && value.trim()) next[key] = value.trim();
    else if (typeof value === 'number' || typeof value === 'boolean') next[key] = value;
  }
  return next;
}

/**
 * Seed from attachment evidence only (no missingFields).
 * @param {Record<string, unknown> | null | undefined} attachmentAnalysis
 */
export function pickAttachmentSeed(attachmentAnalysis) {
  if (!attachmentAnalysis || typeof attachmentAnalysis !== 'object') return {};
  const bag = /** @type {Record<string, unknown>} */ (attachmentAnalysis);
  const seed =
    (bag.seed && typeof bag.seed === 'object' ? bag.seed : null) ||
    (bag.preseededDraft && typeof bag.preseededDraft === 'object' ? bag.preseededDraft : null);
  return seed && typeof seed === 'object' ? { ...seed } : {};
}

/**
 * Strip mutable missingFields — attachment is read-only evidence at runtime.
 * @param {Record<string, unknown> | null | undefined} attachmentAnalysis
 */
export function attachmentAnalysisAsEvidence(attachmentAnalysis) {
  if (!attachmentAnalysis || typeof attachmentAnalysis !== 'object') return null;
  const { missingFields: _omit, ...rest } = /** @type {Record<string, unknown>} */ (attachmentAnalysis);
  return { ...rest, _runtimeEvidenceOnly: true };
}

/**
 * @param {{
 *   attachmentAnalysis?: Record<string, unknown> | null;
 *   preseededDraft?: Record<string, unknown> | null;
 *   ownerInput?: Record<string, unknown> | null;
 *   runtimeUpdates?: Record<string, unknown> | null;
 *   loyaltyRequirements?: Record<string, unknown> | null;
 * }} [parts]
 * @returns {Record<string, unknown>}
 */
export function buildExecutionDraft(parts = {}) {
  const attachmentSeed = pickAttachmentSeed(parts.attachmentAnalysis);
  const preseeded =
    parts.preseededDraft && typeof parts.preseededDraft === 'object' ? parts.preseededDraft : {};
  const ownerRaw = parts.ownerInput && typeof parts.ownerInput === 'object' ? parts.ownerInput : {};
  const topologyAction = normalizeTopologyAction(
    ownerRaw.topologyAction ?? ownerRaw.loyaltyCreationAction,
  );
  const owner = normalizeOwnerInputFields(ownerRaw);
  // Client approve payloads often still carry VISION_EXTRACTED cardTopology; merged preseed is authoritative.
  if (topologyAction === 'APPROVE') {
    delete owner.cardTopology;
    delete owner.topologyReviewRequired;
  }
  const runtime =
    parts.runtimeUpdates && typeof parts.runtimeUpdates === 'object' ? parts.runtimeUpdates : {};
  const requirements =
    parts.loyaltyRequirements && typeof parts.loyaltyRequirements === 'object'
      ? parts.loyaltyRequirements
      : {};

  const draft = {
    ...attachmentSeed,
    ...preseeded,
    ...owner,
    ...runtime,
  };

  if (topologyAction === 'APPROVE') {
    draft.topologyReviewRequired = false;
    if (preseeded.cardTopology && typeof preseeded.cardTopology === 'object') {
      draft.cardTopology = preseeded.cardTopology;
      draft.layoutSource =
        preseeded.layoutSource ?? preseeded.cardTopology.source ?? draft.layoutSource ?? 'APPROVED';
    } else if (draft.cardTopology && typeof draft.cardTopology === 'object') {
      draft.cardTopology = { ...draft.cardTopology, reviewRequired: false, source: 'APPROVED' };
      draft.layoutSource = 'APPROVED';
    }
  }

  if (requirements.reward != null) draft.reward = requirements.reward;
  if (requirements.stampThreshold != null) {
    draft.stampThreshold = requirements.stampThreshold;
    draft.requiredStamps = requirements.stampThreshold;
  }
  if (requirements.programName != null) {
    draft.programName = requirements.programName;
    draft.name = requirements.programName;
  }

  return draft;
}

const OWNER_APPROVED_TOPOLOGY_SOURCES = new Set([
  'APPROVED',
  'OWNER_DEFINED',
  'OWNER_CONFIRMED',
  'PUBLISHED',
]);

const EXTRACTED_TOPOLOGY_SOURCES_NEEDING_REVIEW = new Set([
  'VISION_EXTRACTED',
  'FUSION_VISUAL_OCR',
  'MATRIX_SPEC',
]);

/**
 * Vision-extracted topology must be owner-approved before draft generation.
 * @param {Record<string, unknown> | null | undefined} executionDraft
 */
export function requiresTopologyOwnerReview(executionDraft) {
  const draft = executionDraft && typeof executionDraft === 'object' ? executionDraft : null;
  if (!draft) return false;
  if (draft.topologyRejected === true) return false;
  const topo = draft.cardTopology;
  if (!topo || typeof topo !== 'object') return false;
  const rows = Number(topo.rows);
  const columns = Number(topo.columns);
  if (!(rows > 0 && columns > 0)) return false;

  const source = String(topo.source ?? draft.layoutSource ?? '').trim();
  if (!source || source === 'DEFAULT_TEMPLATE') return false;
  if (OWNER_APPROVED_TOPOLOGY_SOURCES.has(source)) return false;
  if (draft.topologyReviewRequired === true || topo.reviewRequired === true) return true;
  if (EXTRACTED_TOPOLOGY_SOURCES_NEEDING_REVIEW.has(source)) return true;
  if (draft.extractedFromImage === true) return true;
  return false;
}

/**
 * Recompute missing owner fields from canonical draft only.
 * @param {Record<string, unknown> | null | undefined} executionDraft
 * @param {{ requireProgramName?: boolean }} [opts]
 * @returns {string[]}
 */
export function computeMissingFields(executionDraft, opts = {}) {
  const draft = executionDraft && typeof executionDraft === 'object' ? executionDraft : {};
  const rule = draft.rule && typeof draft.rule === 'object' ? draft.rule : null;
  const missing = [];
  const reward = pickString(draft.reward, draft.rewardRule, draft.rewardName, rule?.rewardItem);
  const stamps =
    draft.stampThreshold ??
    draft.requiredStamps ??
    draft.stampsRequired ??
    rule?.purchasesRequired;
  const programName = pickString(draft.programName, draft.name);
  if (!reward) missing.push('reward');
  if (stamps == null || stamps === '' || Number(stamps) <= 0) missing.push('stampThreshold');
  if (opts.requireProgramName && !programName) missing.push('programName');
  return missing;
}

/**
 * @param {Record<string, unknown> | null | undefined} executionDraft
 * @param {{ requireProgramName?: boolean }} [opts]
 */
export function computeLoyaltyPauseFields(executionDraft, opts = {}) {
  if (requiresTopologyOwnerReview(executionDraft)) {
    const rule =
      executionDraft?.rule && typeof executionDraft.rule === 'object' ? executionDraft.rule : null;
    const reward = pickString(rule?.rewardItem, executionDraft?.reward, executionDraft?.rewardRule);
    const stamps = rule?.purchasesRequired ?? executionDraft?.stampThreshold ?? executionDraft?.requiredStamps;
    if (reward && stamps != null && Number(stamps) > 0) {
      return ['topology_review'];
    }
    return ['topology_review', ...computeMissingFields(executionDraft, opts)];
  }
  return computeMissingFields(executionDraft, opts);
}

/**
 * Throw STALE_MISSING_FIELDS when draft has values but missingFields still lists them.
 * @param {Record<string, unknown>} executionDraft
 * @param {string[]} missingFields
 */
export function assertNoStaleMissingFields(executionDraft, missingFields) {
  const missing = (Array.isArray(missingFields) ? missingFields : []).filter((field) => {
    if (field === 'topology_review' && !requiresTopologyOwnerReview(executionDraft)) return false;
    return true;
  });
  if (!missing.length) return;

  const reward = pickString(executionDraft?.reward, executionDraft?.rewardRule, executionDraft?.rule?.rewardItem);
  const stamps =
    executionDraft?.stampThreshold ??
    executionDraft?.requiredStamps ??
    executionDraft?.stampsRequired ??
    executionDraft?.rule?.purchasesRequired;

  if (reward && missing.includes('reward')) {
    const err = new Error(
      'STALE_MISSING_FIELDS: reward is set on executionDraft but missingFields still includes reward',
    );
    err.code = 'STALE_MISSING_FIELDS';
    throw err;
  }
  if (stamps != null && stamps !== '' && Number(stamps) > 0 && missing.includes('stampThreshold')) {
    const err = new Error(
      'STALE_MISSING_FIELDS: stampThreshold is set on executionDraft but missingFields still includes stampThreshold',
    );
    err.code = 'STALE_MISSING_FIELDS';
    throw err;
  }
}

/**
 * @param {string} stage
 * @param {Record<string, unknown>} executionDraft
 * @param {string[]} missingFields
 */
export function logExecutionDraftMerge(stage, executionDraft, missingFields) {
  console.info(
    '[topology.executionDraft]',
    JSON.stringify({
      stage,
      reward: executionDraft?.reward ?? executionDraft?.rewardRule ?? null,
      stampThreshold:
        executionDraft?.stampThreshold ?? executionDraft?.requiredStamps ?? null,
      missingFields,
    }),
  );
}

/**
 * @param {{
 *   attachmentAnalysis?: Record<string, unknown> | null;
 *   preseededDraft?: Record<string, unknown> | null;
 *   ownerInput?: Record<string, unknown> | null;
 *   runtimeUpdates?: Record<string, unknown> | null;
 *   loyaltyRequirements?: Record<string, unknown> | null;
 * }} parts
 */
export function buildAndValidateExecutionDraft(parts = {}) {
  const executionDraft = buildExecutionDraft(parts);
  const missingFields = computeLoyaltyPauseFields(executionDraft);
  const hasOwner =
    parts.ownerInput &&
    typeof parts.ownerInput === 'object' &&
    Object.keys(normalizeOwnerInputFields(parts.ownerInput)).length > 0;
  if (hasOwner) {
    assertNoStaleMissingFields(executionDraft, missingFields);
    logExecutionDraftMerge('owner_input_merge', executionDraft, missingFields);
  }
  return { executionDraft, missingFields };
}
