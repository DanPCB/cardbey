/**
 * Phase 3 — resource substitution when reuse is blocked.
 * Generation remains a recommendation unless an authorized generation flow exists.
 */

import { SUBSTITUTION_ACTION, CUSTODY_MODE } from './types.js';
import { listResourceIndex } from './resourceIndex.js';

/**
 * @param {object} resource
 * @param {object} block — revalidation / rights block result
 * @param {object} [ctx]
 */
export function proposeSubstitutions(resource, block = {}, ctx = {}) {
  const actions = [
    {
      action: SUBSTITUTION_ACTION.FIND_SAFER_ALTERNATIVE,
      available: true,
      description: 'Search for a rights-clearer match with the same intent',
    },
    {
      action: SUBSTITUTION_ACTION.FIND_CARDBEY_HOSTED_EQUIVALENT,
      available: true,
      description: 'Prefer Cardbey Originals / Library hosted equivalents',
    },
    {
      action: SUBSTITUTION_ACTION.FIND_NO_ATTRIBUTION_OPTION,
      available: true,
      description: 'Prefer sources that do not require public attribution (still policy-gated)',
    },
    {
      action: SUBSTITUTION_ACTION.USE_AS_REFERENCE_ONLY,
      available: true,
      custodyMode: CUSTODY_MODE.REFERENCE_ONLY,
      description: 'Keep as reference without pull/host',
    },
    {
      action: SUBSTITUTION_ACTION.REQUEST_PERMISSION,
      available: true,
      description: 'Request permission from rights holder / ops',
    },
    {
      action: SUBSTITUTION_ACTION.GENERATE_ORIGINAL_ALTERNATIVE,
      available: Boolean(ctx.generationFlowAuthorized),
      recommendationOnly: !ctx.generationFlowAuthorized,
      description: ctx.generationFlowAuthorized
        ? 'Generate via authorized Cardbey generation flow'
        : 'Recommend generating an original alternative (not auto-executed)',
    },
  ];

  const alternatives = findLocalAlternatives(resource, ctx);

  return {
    ok: true,
    blocked: Boolean(block.blocked || block.ok === false),
    blockCode: block.code || null,
    sourceResourceId: resource?.id || null,
    actions,
    localAlternatives: alternatives,
    next: {
      saferSearch: 'POST /api/resource-intelligence/workspace/search',
      referenceOnly: CUSTODY_MODE.REFERENCE_ONLY,
    },
  };
}

function findLocalAlternatives(resource, ctx) {
  const industry = resource?.industry || ctx.intent?.industry;
  const all = listResourceIndex({ limit: 40 });
  return all
    .filter((r) => r.id !== resource?.id)
    .filter((r) => {
      if (ctx.preferCardbey && !r.sourceId?.startsWith('src_cardbey')) return false;
      if (industry && r.industry && r.industry !== industry) return false;
      if (resource?.mediaType && r.mediaType !== resource.mediaType) return false;
      return true;
    })
    .slice(0, 5)
    .map((r) => ({
      resourceId: r.id,
      title: r.title,
      sourceId: r.sourceId,
      mediaType: r.mediaType,
      reason: r.sourceId?.startsWith('src_cardbey')
        ? 'cardbey_equivalent_candidate'
        : 'same_intent_alternative',
    }));
}

/**
 * Apply a substitution action into a follow-up search hint (no auto-execution).
 */
export function substitutionToSearchHint(action, resource, intent = {}) {
  switch (action) {
    case SUBSTITUTION_ACTION.FIND_CARDBEY_HOSTED_EQUIVALENT:
      return {
        utterance: intent.utterance || `Cardbey hosted alternative to ${resource?.title || 'resource'}`,
        preferSources: ['src_cardbey_library', 'src_cardbey_originals'],
      };
    case SUBSTITUTION_ACTION.FIND_NO_ATTRIBUTION_OPTION:
      return {
        utterance: intent.utterance || 'Find no-attribution commercial alternative',
        rights: { preferNoAttribution: true },
      };
    case SUBSTITUTION_ACTION.USE_AS_REFERENCE_ONLY:
      return { custodyMode: CUSTODY_MODE.REFERENCE_ONLY, executeSearch: false };
    case SUBSTITUTION_ACTION.GENERATE_ORIGINAL_ALTERNATIVE:
      return {
        recommendGeneration: true,
        autoGenerate: false,
        note: 'Generation not executed by URI without authorized flow',
      };
    default:
      return {
        utterance:
          intent.utterance ||
          `Find a safer commercial alternative to ${resource?.title || 'this resource'}`,
      };
  }
}
