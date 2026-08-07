/**
 * Phase 5 — AI Federation Planner.
 * Selects a subset of sources for a task instead of querying every active node.
 */

import { ensureFederationReady, listActiveSourcesForPlan, isCircuitOpen } from './sourceFederation.js';
import { RESOURCE_CLASS } from './types.js';
import { Features } from '../../config/features.js';

function plannerEnabled() {
  return Boolean(
    Features.universalResourceIntelligence?.federationPlannerV1 ??
      Features.universalResourceIntelligence?.providerSdkV1 ??
      Features.universalResourceIntelligence?.federationV1,
  );
}

/**
 * @param {object} intent
 * @param {object} [opts]
 * @param {number} [opts.maxExternal=3]
 */
export async function planFederationSources(intent = {}, opts = {}) {
  await ensureFederationReady();
  const maxExternal = Math.min(Math.max(Number(opts.maxExternal) || 3, 1), 6);
  const sources = listActiveSourcesForPlan();
  const selected = [];
  const skipped = [];

  const preferCleared = intent.rights?.preferOpenOrCleared !== false;
  const allowReference = intent.rights?.allowReference !== false;
  const needsMedia =
    !intent.mediaType ||
    ['image', 'video', 'audio', 'photo', null].includes(intent.mediaType);

  for (const s of sources) {
    if (isCircuitOpen(s.id)) {
      skipped.push({ sourceId: s.id, reason: 'circuit_open' });
      continue;
    }
    if (s.opsIntakeOnly) {
      skipped.push({ sourceId: s.id, reason: 'ops_intake_only' });
      continue;
    }
    if (s.consumerDiscoverable === false) {
      skipped.push({ sourceId: s.id, reason: 'not_consumer_discoverable' });
      continue;
    }
    if (s.resourceClass === RESOURCE_CLASS.COMMERCIAL || s.commercial) {
      if (!intent.allowCommercial) {
        skipped.push({
          sourceId: s.id,
          reason: 'commercial_excluded',
          note: 'Never treat commercial assets as free',
        });
        continue;
      }
    }
    if (s.resourceClass === RESOURCE_CLASS.CREATIVE_PLATFORM) {
      skipped.push({
        sourceId: s.id,
        reason: 'creative_platform_reference_phase',
        note: 'Reference-first; not selected for default media fan-out',
      });
      continue;
    }

    // Always prefer Cardbey first-party
    if (s.resourceClass === RESOURCE_CLASS.CARDBEY || s.kind === 'CARDBEY' || s.kind === 'CREATOR') {
      if (s.id === 'src_cardbey_capability') {
        const wantCaps =
          intent.purpose === 'store_setup' ||
          /starter|launch|pack|kit/i.test(String(intent.utterance || ''));
        if (!wantCaps) {
          skipped.push({ sourceId: s.id, reason: 'capability_not_needed' });
          continue;
        }
      }
      selected.push({
        sourceId: s.id,
        protocol: s.protocol,
        resourceClass: s.resourceClass,
        priority: s.id.includes('originals') ? 2 : s.id.includes('creator') ? 3 : 1,
        why: 'first_party_cardbey',
      });
      continue;
    }

    if (!needsMedia) {
      skipped.push({ sourceId: s.id, reason: 'media_not_needed' });
      continue;
    }
    if (!allowReference && s.hostingMode === 'REFERENCE') {
      skipped.push({ sourceId: s.id, reason: 'reference_not_allowed' });
      continue;
    }
    if (preferCleared && s.resourceClass === RESOURCE_CLASS.OPEN_MEDIA) {
      // open media OK
    } else if (s.resourceClass === RESOURCE_CLASS.OPEN_MEDIA) {
      // still OK
    } else if (s.resourceClass === RESOURCE_CLASS.PUBLIC_KNOWLEDGE) {
      // knowledge before media fill — include lightly when place/entity intent
      if (!/find|where|near|melbourne|location|café|cafe/i.test(String(intent.utterance || ''))) {
        skipped.push({ sourceId: s.id, reason: 'knowledge_not_needed' });
        continue;
      }
    } else {
      skipped.push({ sourceId: s.id, reason: 'class_not_selected' });
      continue;
    }

    const externalCount = selected.filter((x) => x.resourceClass === RESOURCE_CLASS.OPEN_MEDIA)
      .length;
    if (externalCount >= maxExternal) {
      skipped.push({ sourceId: s.id, reason: 'max_external_reached', maxExternal });
      continue;
    }

    // Prefer Openverse then Pexels then others for open media
    let priority = 5;
    if (s.id === 'src_openverse') priority = 4;
    if (s.id === 'src_pexels') priority = 4;
    if (s.id === 'src_pixabay') priority = 5;
    if (s.id === 'src_unsplash') priority = 5;

    selected.push({
      sourceId: s.id,
      protocol: s.protocol,
      resourceClass: s.resourceClass,
      priority,
      why: 'open_media_federation',
    });
  }

  selected.sort((a, b) => a.priority - b.priority);

  // Cap total open-media after sort (keep best priorities)
  const cardbey = selected.filter((s) => s.resourceClass === RESOURCE_CLASS.CARDBEY);
  let external = selected.filter((s) => s.resourceClass === RESOURCE_CLASS.OPEN_MEDIA);
  if (external.length > maxExternal) {
    for (const drop of external.slice(maxExternal)) {
      skipped.push({ sourceId: drop.sourceId, reason: 'max_external_trim' });
    }
    external = external.slice(0, maxExternal);
  }

  const finalSelected = [...cardbey, ...external].sort((a, b) => a.priority - b.priority);

  return {
    ok: true,
    planner: plannerEnabled() ? 'federation_planner_v1' : 'federation_planner_v1_compat',
    selected: finalSelected,
    skipped,
    maxExternal,
    note: 'URI asks Federation; products never choose providers',
  };
}
