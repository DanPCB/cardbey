/**
 * Universal learning — record execution signals for all artifact types.
 */

import { recordArtifactLearningEvent } from './artifactPersistence.js';

/**
 * @param {{
 *   definition: import('./ArtifactDefinition.js').ArtifactDefinition;
 *   execution: import('./ArtifactExecution.js').ArtifactExecutionState;
 *   generated?: Record<string, unknown>;
 *   validation?: Record<string, unknown>;
 *   publications?: Record<string, unknown>[];
 * }} input
 */
export async function recordArtifactLearning(input) {
  const { definition, execution, generated, validation, publications } = input;
  const event = {
    artifactId: definition.artifactId,
    type: definition.type,
    missionId: definition.missionId ?? null,
    storeId: definition.storeId ?? null,
    owner: definition.owner,
    stagesCompleted: execution.completedStages ?? [],
    status: execution.status,
    inputs: {
      required: definition.requiredInputs,
      optional: definition.optionalInputs,
      contextKeys: Object.keys(definition.context ?? {}),
    },
    generatedSummary: summarizeGenerated(generated),
    validation: validation ?? null,
    publications: publications ?? [],
    approval: execution.approval ?? null,
    timingMs: execution.timingMs ?? null,
    recordedAt: new Date().toISOString(),
  };

  await recordArtifactLearningEvent(event);
  return { ok: true, data: event };
}

/**
 * @param {Record<string, unknown>|undefined} generated
 */
function summarizeGenerated(generated) {
  if (!generated || typeof generated !== 'object') return null;
  return {
    hasUrl: Boolean(generated.url || generated.previewUrl),
    provider: generated.provider ?? null,
    sourceTool: generated.sourceTool ?? null,
    status: generated.status ?? null,
  };
}
