/**
 * Phase 6 — Owner review artifact for research-backed store creation.
 */

/** @typedef {import('./types.js').StoreResearchReviewArtifact} StoreResearchReviewArtifact */
/** @typedef {import('./types.js').BusinessEvidence} BusinessEvidence */
/** @typedef {import('./types.js').BusinessEntityResolutionResult} BusinessEntityResolutionResult */
/** @typedef {import('./types.js').DiscoveredSource} DiscoveredSource */

/**
 * @param {object} params
 * @returns {StoreResearchReviewArtifact}
 */
export function buildStoreResearchReviewArtifact(params) {
  const {
    missionId,
    draftId = null,
    entityResolution,
    evidence = null,
    sources = [],
    suggestedItems = [],
  } = params;

  const missingFields = [];
  const profile = evidence?.profile ?? {};
  for (const key of ['businessName', 'address', 'phone', 'website', 'openingHours']) {
    if (!profile[key]?.value) missingFields.push(key);
  }

  return {
    artifactType: 'store_research_review',
    missionId,
    draftId,
    matchedBusiness: entityResolution?.selectedCandidate ?? entityResolution?.candidates?.[0] ?? null,
    candidates: entityResolution?.candidates ?? [],
    sourcesUsed: sources,
    extractedProfile: profile,
    extractedCatalog: evidence?.catalogItems ?? [],
    conflicts: evidence?.conflicts ?? [],
    missingFields,
    suggestedItems,
    imageRightsWarnings: evidence?.imageRightsWarnings ?? [],
    confidence: evidence?.confidence ?? entityResolution?.confidence ?? 0,
    requiresOwnerConfirmation: Boolean(
      entityResolution?.requiresOwnerConfirmation ||
        (evidence?.conflicts?.length ?? 0) > 0 ||
        missingFields.length > 0,
    ),
    actions: [
      'confirm_and_create',
      'edit_extracted_data',
      'exclude_source',
      'replace_with_upload',
      'use_suggestions',
      'start_blank',
    ],
  };
}

/**
 * Whether downstream stages may persist/publish store draft.
 * @param {StoreResearchReviewArtifact|null|undefined} artifact
 * @param {boolean} ownerConfirmed
 */
export function canPersistStoreDraftFromResearch(artifact, ownerConfirmed) {
  if (!artifact) return true;
  if (!artifact.requiresOwnerConfirmation) return true;
  return Boolean(ownerConfirmed);
}
