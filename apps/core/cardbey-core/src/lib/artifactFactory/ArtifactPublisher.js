/**
 * Universal publisher — governed publish to artifact-defined targets.
 */

import { getArtifactAdapter } from './ArtifactRegistry.js';

const PUBLISH_HANDLERS = {
  mission: async (definition, ctx, generated) => ({
    target: 'mission',
    status: 'recorded',
    artifactId: definition.artifactId,
    url: generated.url ?? generated.previewUrl ?? null,
  }),
  content_studio: async (definition, ctx, generated) => ({
    target: 'content_studio',
    status: 'handoff',
    handoffUrl: generated.contentStudioUrl ?? `/content-studio?artifactId=${definition.artifactId}`,
  }),
  store: async (definition, ctx, generated) => ({
    target: 'store',
    status: 'pending_confirmation',
    storeId: definition.storeId ?? ctx.resolvedContext?.storeId ?? null,
  }),
};

/**
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @param {import('./ArtifactExecution.js').ArtifactExecutionContext} ctx
 * @param {Record<string, unknown>} generated
 */
export async function publishArtifact(definition, ctx, generated) {
  const adapter = getArtifactAdapter(definition.type);
  const adapterResult = adapter ? await adapter.publish(definition, ctx, generated) : { ok: true, data: {} };

  const targets =
    definition.publishTargets?.length > 0
      ? definition.publishTargets
      : ['mission'];

  /** @type {Record<string, unknown>[]} */
  const publications = [];
  for (const target of targets) {
    const handler = PUBLISH_HANDLERS[target];
    if (handler) {
      publications.push(await handler(definition, ctx, generated));
    } else {
      publications.push({ target, status: 'unsupported', message: 'Publish target not configured' });
    }
  }

  return {
    ok: adapterResult.ok !== false,
    data: {
      publications,
      adapter: adapterResult.data ?? null,
    },
    error: adapterResult.error,
  };
}
