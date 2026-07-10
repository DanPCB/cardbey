/**
 * Blueprint planner — research + structure before generation.
 */

import { createArtifactBlueprint } from './ArtifactBlueprint.js';

/**
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @param {import('./ArtifactContextResolver.js').ResolvedArtifactContext} resolvedContext
 * @param {{ assets: import('./ArtifactAssetResolver.js').ResolvedAsset[]; byRole: Record<string, import('./ArtifactAssetResolver.js').ResolvedAsset[]> }} assetBundle
 * @param {Record<string, unknown>} [research]
 */
export function planArtifactBlueprint(definition, resolvedContext, assetBundle, research = {}) {
  const structure = buildStructureForType(definition, resolvedContext, research);
  const outputs = buildOutputsForType(definition);

  return createArtifactBlueprint({
    artifactId: definition.artifactId,
    type: definition.type,
    objective: definition.objective,
    assets: {
      resolved: assetBundle.assets,
      byRole: assetBundle.byRole,
      required: definition.requiredInputs,
      optional: definition.optionalInputs,
    },
    structure,
    outputs,
    metadata: {
      storeId: resolvedContext.storeId,
      missionId: resolvedContext.missionId,
      locale: resolvedContext.locale,
      research,
      brandProfile: resolvedContext.brandProfile,
    },
  });
}

/**
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 * @param {import('./ArtifactContextResolver.js').ResolvedArtifactContext} ctx
 * @param {Record<string, unknown>} research
 */
function buildStructureForType(definition, ctx, research) {
  const base = {
    objective: definition.objective,
    storeName: ctx.business?.name ?? null,
    locale: ctx.locale,
  };

  switch (definition.type) {
    case 'promotion_graphic':
    case 'poster':
    case 'flyer':
      return {
        ...base,
        offer: definition.context.offer ?? definition.requiredInputs.offer ?? null,
        formats: definition.outputs.formats ?? ['facebook', 'instagram', 'a4'],
        headline: research.headline ?? definition.objective,
      };
    case 'promotion_video':
    case 'reel':
    case 'story':
      return {
        ...base,
        voice: definition.context.voice ?? definition.optionalInputs.voice ?? 'neutral',
        subtitle: definition.context.subtitle ?? definition.optionalInputs.subtitle ?? ctx.locale,
        music: definition.context.music ?? 'calm',
        scenes: research.scenes ?? definition.context.scenes ?? [],
      };
    case 'website':
    case 'landing_page':
    case 'store_profile':
      return {
        ...base,
        pages: definition.context.pages ?? ['home', 'services'],
        theme: definition.context.theme ?? 'modern',
      };
    case 'menu':
    case 'catalog':
      return {
        ...base,
        categories: definition.context.categories ?? [],
        syncMode: definition.context.syncMode ?? 'validate',
      };
    case 'loyalty_program':
      return {
        ...base,
        rewards: definition.context.rewards ?? definition.requiredInputs.rewards ?? [],
        pointsModel: definition.context.pointsModel ?? 'visit',
      };
    case 'slideshow':
    case 'presentation':
      return {
        ...base,
        slides: definition.context.slides ?? research.slides ?? [],
      };
    default:
      return { ...base, ...definition.context };
  }
}

/**
 * @param {import('./ArtifactDefinition.js').ArtifactDefinition} definition
 */
function buildOutputsForType(definition) {
  if (definition.outputs && Object.keys(definition.outputs).length > 0) {
    return { ...definition.outputs };
  }
  const targets = definition.publishTargets?.length ? definition.publishTargets : ['mission'];
  return { targets, formats: definition.context.formats ?? ['default'] };
}
