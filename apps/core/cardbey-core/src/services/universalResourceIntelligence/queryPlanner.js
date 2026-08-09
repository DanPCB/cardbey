/**
 * AI Query Planner — Intent → Search Plan via Federation Planner (Phase 5).
 * No hardcoded single-provider path.
 */

import { planFederationSources } from './federationPlanner.js';
import { getSourceNode } from './sourceFederation.js';
import { PROTOCOL } from './types.js';

/**
 * @param {object} intent
 */
export async function planSearchFromIntent(intent) {
  if (!intent || typeof intent !== 'object') {
    return { ok: false, error: 'intent_required' };
  }

  const federation = await planFederationSources(intent, {
    maxExternal: Number(intent.maxExternalSources) || 3,
  });

  const derivedQuery = buildDerivedQuery(intent);
  const steps = [];

  for (const sel of federation.selected || []) {
    const source = getSourceNode(sel.sourceId);
    if (!source) continue;

    const isExternal =
      sel.resourceClass === 'OPEN_MEDIA' ||
      source.protocol === PROTOCOL.PEXELS_API ||
      source.protocol === PROTOCOL.OPENVERSE_API ||
      source.protocol === PROTOCOL.PIXABAY_API ||
      source.protocol === PROTOCOL.UNSPLASH_API ||
      source.protocol === PROTOCOL.PROVIDER_ADAPTER;

    steps.push({
      id: `step_${sel.sourceId.replace(/^src_/, '')}`,
      sourceId: sel.sourceId,
      protocol: source.protocol,
      mode: isExternal ? 'adapter_search' : source.discoveryMode || 'index_query',
      filters: {
        industry: intent.industry,
        mediaType: intent.mediaType,
        language: intent.language,
        orientation: intent.orientation,
        collection: sel.sourceId === 'src_cardbey_originals' ? 'cardbey-originals' : undefined,
      },
      derivedQuery: isExternal ? derivedQuery : undefined,
      priority: sel.priority,
      hostingMode: source.hostingMode,
      why: sel.why,
    });
  }

  steps.sort((a, b) => a.priority - b.priority);

  return {
    ok: true,
    searchPlan: {
      id: `plan_${Date.now().toString(36)}`,
      intentId: intent.id,
      createdAt: new Date().toISOString(),
      steps,
      federation: {
        selected: federation.selected,
        skipped: federation.skipped,
        planner: federation.planner,
        maxExternal: federation.maxExternal,
      },
      policies: {
        download: false,
        host: false,
        publish: false,
        rightsAuthority: 'rights_intelligence',
      },
      rationale: [
        ...steps.map((s) => ({
          stepId: s.id,
          sourceId: s.sourceId,
          why: s.why || `Federation selected (priority ${s.priority})`,
        })),
        ...(federation.skipped || []).map((s) => ({
          stepId: null,
          sourceId: s.sourceId,
          why: `skipped:${s.reason}`,
        })),
      ],
    },
  };
}

function buildDerivedQuery(intent) {
  const parts = [];
  if (intent.preferences?.mood) parts.push(intent.preferences.mood);
  if (intent.industry === 'food-drink') parts.push('cafe interior');
  else if (intent.industry) parts.push(String(intent.industry).replace(/-/g, ' '));
  if (intent.mediaType === 'video') parts.push('video ambience');
  if (intent.channel === 'display') parts.push('background');
  if (!parts.length && intent.utterance) {
    return intent.utterance.slice(0, 80);
  }
  return parts.join(' ') || 'business media';
}
