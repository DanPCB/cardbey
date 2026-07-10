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
  const owner = normalizeOwnerInputFields(parts.ownerInput);
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

/**
 * Recompute missing owner fields from canonical draft only.
 * @param {Record<string, unknown> | null | undefined} executionDraft
 * @param {{ requireProgramName?: boolean }} [opts]
 * @returns {string[]}
 */
export function computeMissingFields(executionDraft, opts = {}) {
  const draft = executionDraft && typeof executionDraft === 'object' ? executionDraft : {};
  const missing = [];
  const reward = pickString(draft.reward, draft.rewardRule, draft.rewardName);
  const stamps = draft.stampThreshold ?? draft.requiredStamps ?? draft.stampsRequired;
  const programName = pickString(draft.programName, draft.name);
  if (!reward) missing.push('reward');
  if (stamps == null || stamps === '' || Number(stamps) <= 0) missing.push('stampThreshold');
  if (opts.requireProgramName && !programName) missing.push('programName');
  return missing;
}

/**
 * Throw STALE_MISSING_FIELDS when draft has values but missingFields still lists them.
 * @param {Record<string, unknown>} executionDraft
 * @param {string[]} missingFields
 */
export function assertNoStaleMissingFields(executionDraft, missingFields) {
  const missing = Array.isArray(missingFields) ? missingFields : [];
  if (!missing.length) return;

  const reward = pickString(executionDraft?.reward, executionDraft?.rewardRule);
  const stamps =
    executionDraft?.stampThreshold ??
    executionDraft?.requiredStamps ??
    executionDraft?.stampsRequired;

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
  const missingFields = computeMissingFields(executionDraft);
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
