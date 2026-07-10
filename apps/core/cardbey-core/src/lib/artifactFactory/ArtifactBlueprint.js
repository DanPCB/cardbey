/**
 * Artifact Blueprint — single source of truth before generation.
 */

import { randomUUID } from 'crypto';

/**
 * @typedef {Object} ArtifactBlueprint
 * @property {string} blueprintId
 * @property {string} artifactId
 * @property {string} type
 * @property {string} objective
 * @property {Record<string, unknown>} assets
 * @property {Record<string, unknown>} structure
 * @property {Record<string, unknown>} outputs
 * @property {Record<string, unknown>} [metadata]
 * @property {string} status
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @param {{
 *   artifactId: string;
 *   type: string;
 *   objective: string;
 *   assets?: Record<string, unknown>;
 *   structure?: Record<string, unknown>;
 *   outputs?: Record<string, unknown>;
 *   metadata?: Record<string, unknown>;
 * }} input
 * @returns {ArtifactBlueprint}
 */
export function createArtifactBlueprint(input) {
  const now = new Date().toISOString();
  return {
    blueprintId: `bp-${randomUUID()}`,
    artifactId: input.artifactId,
    type: input.type,
    objective: input.objective,
    assets: input.assets && typeof input.assets === 'object' ? { ...input.assets } : {},
    structure: input.structure && typeof input.structure === 'object' ? { ...input.structure } : {},
    outputs: input.outputs && typeof input.outputs === 'object' ? { ...input.outputs } : {},
    metadata:
      input.metadata && typeof input.metadata === 'object' ? { ...input.metadata } : undefined,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * @param {unknown} raw
 * @returns {ArtifactBlueprint|null}
 */
export function normalizeArtifactBlueprint(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const o = /** @type {Record<string, unknown>} */ (raw);
  const artifactId = typeof o.artifactId === 'string' ? o.artifactId.trim() : '';
  const type = typeof o.type === 'string' ? o.type.trim() : '';
  const objective = typeof o.objective === 'string' ? o.objective.trim() : '';
  if (!artifactId || !type) return null;
  const now = new Date().toISOString();
  return {
    blueprintId:
      typeof o.blueprintId === 'string' && o.blueprintId.trim()
        ? o.blueprintId.trim()
        : `bp-${randomUUID()}`,
    artifactId,
    type,
    objective: objective || type,
    assets: o.assets && typeof o.assets === 'object' ? /** @type {Record<string, unknown>} */ (o.assets) : {},
    structure:
      o.structure && typeof o.structure === 'object'
        ? /** @type {Record<string, unknown>} */ (o.structure)
        : {},
    outputs:
      o.outputs && typeof o.outputs === 'object' ? /** @type {Record<string, unknown>} */ (o.outputs) : {},
    metadata:
      o.metadata && typeof o.metadata === 'object'
        ? /** @type {Record<string, unknown>} */ (o.metadata)
        : undefined,
    status: typeof o.status === 'string' ? o.status : 'draft',
    createdAt: typeof o.createdAt === 'string' ? o.createdAt : now,
    updatedAt: typeof o.updatedAt === 'string' ? o.updatedAt : now,
  };
}
