/**
 * Provider-neutral analysis-stage contract — Business Operation Intelligence Phase C.
 * Stages map only to real work (no decorative fake stages).
 */

export const ANALYSIS_STAGE_STATUS = Object.freeze({
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  SKIPPED: 'SKIPPED',
});

export const EXISTING_ANALYSIS_STAGES = Object.freeze([
  {
    id: 'UNDERSTANDING_BUSINESS',
    label: 'Understanding business',
    userHint: 'Business identified',
  },
  {
    id: 'RESOLVING_IDENTITY',
    label: 'Resolving identity',
    userHint: 'Identity reviewed',
  },
  {
    id: 'CHECKING_LOCATION',
    label: 'Checking location',
    userHint: 'Location confirmed',
  },
  {
    id: 'CHECKING_ONLINE_PRESENCE',
    label: 'Checking online presence',
    userHint: 'Online presence checked',
  },
  {
    id: 'DISCOVERING_OFFERINGS',
    label: 'Discovering offerings',
    userHint: 'Offerings reviewed',
  },
  {
    id: 'BUILDING_SNAPSHOT',
    label: 'Building snapshot',
    userHint: 'Snapshot prepared',
  },
]);

export const INTENDED_ANALYSIS_STAGES = Object.freeze([
  {
    id: 'UNDERSTANDING_CONCEPT',
    label: 'Understanding concept',
    userHint: 'Business idea understood',
  },
  {
    id: 'CONFIRMING_TARGET_LOCATION',
    label: 'Confirming target location',
    userHint: 'Target location',
  },
  {
    id: 'STRUCTURING_BUSINESS_MODEL',
    label: 'Structuring business model',
    userHint: 'Operating model',
  },
  {
    id: 'IDENTIFYING_ASSUMPTIONS',
    label: 'Identifying assumptions',
    userHint: 'Key assumptions identified',
  },
  {
    id: 'IDENTIFYING_INFORMATION_GAPS',
    label: 'Identifying information gaps',
    userHint: 'What we need next',
  },
  {
    id: 'BUILDING_SNAPSHOT',
    label: 'Building snapshot',
    userHint: 'Concept snapshot prepared',
  },
]);

/**
 * @param {'EXISTING' | 'INTENDED'} mode
 */
export function stageDefinitionsForMode(mode) {
  return mode === 'INTENDED' ? INTENDED_ANALYSIS_STAGES : EXISTING_ANALYSIS_STAGES;
}

/**
 * @param {{ id: string, label: string, userHint: string }} def
 */
export function createPendingStage(def) {
  return {
    id: def.id,
    type: def.id,
    label: def.label,
    userHint: def.userHint,
    status: ANALYSIS_STAGE_STATUS.PENDING,
    startedAt: null,
    completedAt: null,
    resultSummary: null,
    evidenceCount: null,
    failureReason: null,
  };
}

/**
 * @param {object} stage
 * @param {Partial<object>} patch
 */
export function patchStage(stage, patch) {
  return { ...stage, ...patch };
}
