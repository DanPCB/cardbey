/**
 * Phase 7 — Mission contract freeze after owner confirmation.
 */

/** @typedef {import('./types.js').StoreCreationMissionContract} StoreCreationMissionContract */

/**
 * @param {object} params
 * @returns {StoreCreationMissionContract}
 */
export function buildStoreCreationMissionContract(params) {
  const {
    evidenceId,
    entityId = null,
    selectedBusinessCandidate = null,
    approvedSources = [],
    executionContext = {},
    contentPolicy = {
      sourcedFieldsApproved: false,
      suggestedFieldsApproved: false,
    },
  } = params;

  return {
    family: 'store_creation',
    entityId,
    evidenceId,
    selectedBusinessCandidate,
    approvedSources,
    executionContext,
    expectedArtifacts: ['store_draft'],
    contentPolicy: {
      sourcedFieldsApproved: Boolean(contentPolicy.sourcedFieldsApproved),
      suggestedFieldsApproved: Boolean(contentPolicy.suggestedFieldsApproved),
    },
  };
}

/**
 * Freeze contract with timestamp — immutable after owner confirm.
 * @param {StoreCreationMissionContract} contract
 */
export function freezeStoreCreationMissionContract(contract) {
  return {
    ...contract,
    frozenAt: new Date().toISOString(),
  };
}

/**
 * @param {object|null|undefined} metadata
 */
export function readStoreCreationMissionContract(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  const c = meta.storeCreationMissionContract ?? meta.missionContract;
  return c && typeof c === 'object' && c.family === 'store_creation' ? c : null;
}
