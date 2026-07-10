/**
 * Canonical Artifact Definition — single schema for all governed artifact creation.
 */

import { randomUUID } from 'crypto';

/** @typedef {import('./ArtifactBlueprint.js').ArtifactBlueprint} ArtifactBlueprint */

/**
 * @typedef {Object} ArtifactDefinition
 * @property {string} artifactId
 * @property {string} type
 * @property {string} objective
 * @property {string} owner
 * @property {string} [storeId]
 * @property {string} [missionId]
 * @property {Record<string, unknown>} context
 * @property {Record<string, unknown>} requiredInputs
 * @property {Record<string, unknown>} optionalInputs
 * @property {ArtifactBlueprint|null} [blueprint]
 * @property {Record<string, unknown>} outputs
 * @property {string[]} [validationRules]
 * @property {string[]} [publishTargets]
 */

export const ARTIFACT_PIPELINE_STAGES = [
  'resolve_context',
  'research',
  'collect_inputs',
  'create_blueprint',
  'owner_review',
  'generate',
  'validate',
  'revision',
  'approval',
  'publish',
  'learn',
];

/**
 * @param {Partial<ArtifactDefinition> & { type: string; objective: string; owner: string }} raw
 * @returns {ArtifactDefinition}
 */
export function createArtifactDefinition(raw) {
  const type = String(raw.type ?? '').trim();
  const objective = String(raw.objective ?? '').trim();
  const owner = String(raw.owner ?? '').trim();
  if (!type || !objective || !owner) {
    throw new Error('artifact type, objective, and owner are required');
  }

  return {
    artifactId: String(raw.artifactId ?? `art-${randomUUID()}`).trim(),
    type,
    objective,
    owner,
    storeId: typeof raw.storeId === 'string' && raw.storeId.trim() ? raw.storeId.trim() : undefined,
    missionId:
      typeof raw.missionId === 'string' && raw.missionId.trim() ? raw.missionId.trim() : undefined,
    context: raw.context && typeof raw.context === 'object' ? { ...raw.context } : {},
    requiredInputs:
      raw.requiredInputs && typeof raw.requiredInputs === 'object' ? { ...raw.requiredInputs } : {},
    optionalInputs:
      raw.optionalInputs && typeof raw.optionalInputs === 'object' ? { ...raw.optionalInputs } : {},
    blueprint: raw.blueprint ?? null,
    outputs: raw.outputs && typeof raw.outputs === 'object' ? { ...raw.outputs } : {},
    validationRules: Array.isArray(raw.validationRules)
      ? raw.validationRules.map((r) => String(r).trim()).filter(Boolean)
      : [],
    publishTargets: Array.isArray(raw.publishTargets)
      ? raw.publishTargets.map((t) => String(t).trim()).filter(Boolean)
      : [],
  };
}

/**
 * @param {unknown} raw
 * @returns {ArtifactDefinition|null}
 */
export function normalizeArtifactDefinition(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  try {
    const o = /** @type {Record<string, unknown>} */ (raw);
    return createArtifactDefinition({
      artifactId: typeof o.artifactId === 'string' ? o.artifactId : undefined,
      type: String(o.type ?? o.artifactType ?? ''),
      objective: String(o.objective ?? o.goal ?? ''),
      owner: String(o.owner ?? o.ownerUserId ?? o.userId ?? ''),
      storeId: typeof o.storeId === 'string' ? o.storeId : undefined,
      missionId: typeof o.missionId === 'string' ? o.missionId : undefined,
      context: o.context,
      requiredInputs: o.requiredInputs ?? o.inputs,
      optionalInputs: o.optionalInputs,
      blueprint: o.blueprint,
      outputs: o.outputs,
      validationRules: o.validationRules,
      publishTargets: o.publishTargets,
    });
  } catch {
    return null;
  }
}

/**
 * @param {ArtifactDefinition} definition
 * @param {Record<string, unknown>} [overrides]
 */
export function mergeArtifactDefinition(definition, overrides = {}) {
  return createArtifactDefinition({
    ...definition,
    ...overrides,
    context: { ...definition.context, ...(overrides.context ?? {}) },
    requiredInputs: { ...definition.requiredInputs, ...(overrides.requiredInputs ?? {}) },
    optionalInputs: { ...definition.optionalInputs, ...(overrides.optionalInputs ?? {}) },
    outputs: { ...definition.outputs, ...(overrides.outputs ?? {}) },
    blueprint: overrides.blueprint ?? definition.blueprint,
  });
}
