/**
 * Universal generator — delegates to type adapter.
 */

import { getArtifactAdapter } from './ArtifactRegistry.js';

/**
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @param {import('./ArtifactExecution.js').ArtifactExecutionContext} ctx
 */
export async function generateArtifact(definition, ctx) {
  const adapter = getArtifactAdapter(definition.type);
  if (!adapter) {
    return {
      ok: false,
      error: { code: 'adapter_not_found', message: `No adapter for artifact type: ${definition.type}` },
    };
  }
  return adapter.generate(definition, ctx);
}
