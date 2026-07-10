/**
 * Base Artifact Adapter — type-specific prepare/generate/validate/publish only.
 */

/**
 * @typedef {import('./ArtifactDefinition.js').ArtifactDefinition} ArtifactDefinition
 * @typedef {import('./ArtifactBlueprint.js').ArtifactBlueprint} ArtifactBlueprint
 * @typedef {import('./ArtifactExecution.js').ArtifactExecutionContext} ArtifactExecutionContext
 * @typedef {import('./ArtifactExecution.js').ArtifactStageResult} ArtifactStageResult
 */

/**
 * @typedef {Object} ArtifactAdapter
 * @property {string} type
 * @property {string} [label]
 * @property {string[]} [legacyTools]
 * @property {(definition: ArtifactDefinition, ctx: ArtifactExecutionContext) => Promise<ArtifactStageResult>} prepare
 * @property {(definition: ArtifactDefinition, ctx: ArtifactExecutionContext) => Promise<ArtifactStageResult>} generate
 * @property {(definition: ArtifactDefinition, ctx: ArtifactExecutionContext, generated: Record<string, unknown>) => Promise<ArtifactStageResult>} validate
 * @property {(definition: ArtifactDefinition, ctx: ArtifactExecutionContext, generated: Record<string, unknown>) => Promise<ArtifactStageResult>} publish
 */

/**
 * @param {Partial<ArtifactAdapter> & Pick<ArtifactAdapter, 'type' | 'generate'>} spec
 * @returns {ArtifactAdapter}
 */
export function defineArtifactAdapter(spec) {
  const noopStage = async () => ({ ok: true, data: {} });
  return {
    type: spec.type,
    label: spec.label ?? spec.type,
    legacyTools: spec.legacyTools ?? [],
    prepare: spec.prepare ?? noopStage,
    generate: spec.generate,
    validate: spec.validate ?? noopStage,
    publish: spec.publish ?? noopStage,
  };
}

/**
 * @param {Record<string, unknown>} toolInput
 * @param {ArtifactDefinition} definition
 */
export function buildToolDispatchEnvelope(toolInput, definition) {
  return {
    ...toolInput,
    storeId: definition.storeId ?? toolInput.storeId,
    missionId: definition.missionId ?? toolInput.missionId,
    objective: definition.objective,
    context: { ...definition.context, artifactId: definition.artifactId, artifactType: definition.type },
  };
}
