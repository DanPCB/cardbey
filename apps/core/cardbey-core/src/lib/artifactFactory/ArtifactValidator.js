/**
 * Universal validator — loads validation packs per artifact type.
 */

import { getArtifactAdapter } from './ArtifactRegistry.js';
import { resolveValidationPackId, runValidationPack } from './validationPacks/index.js';

/**
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @param {import('./ArtifactExecution.js').ArtifactExecutionContext} ctx
 * @param {Record<string, unknown>} generated
 */
export async function validateArtifact(definition, ctx, generated) {
  const adapter = getArtifactAdapter(definition.type);
  const adapterResult = adapter ? await adapter.validate(definition, ctx, generated) : { ok: true, data: {} };

  const packId = resolveValidationPackId(definition.type);
  const findings = runValidationPack(packId, generated, definition.validationRules);
  const errors = findings.filter((f) => f.severity === 'error');
  const warnings = findings.filter((f) => f.severity === 'warning');

  const ok = errors.length === 0 && adapterResult.ok !== false;
  return {
    ok,
    data: {
      findings,
      warnings,
      errors,
      adapter: adapterResult.data ?? null,
    },
    error: ok
      ? undefined
      : {
          code: 'validation_failed',
          message: errors[0]?.message ?? adapterResult.error?.message ?? 'Validation failed',
          findings,
        },
  };
}
