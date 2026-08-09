/**
 * Discovery Engine — find / index / fingerprint / understand via Provider Federation.
 * Does NOT download or host binaries by default.
 */

import { upsertResourceRecord, listResourceIndex } from './resourceIndex.js';
import {
  ensureFederationReady,
  getSourceNode,
  getAdapter,
  consumeRateBudget,
  openCircuit,
  recordAdapterHealth,
} from './sourceFederation.js';
import { PROTOCOL } from './types.js';
import { enrichWithAiMetadata } from './metadataIntelligence.js';
import { suggestRights } from './rightsIntelligence.js';
import { normalizeAdapterHit } from './providerSdk/normalizeResource.js';

/**
 * Execute a search plan against federation (metadata/index only).
 * @param {import('@prisma/client').PrismaClient | null} prisma
 * @param {object} searchPlan
 * @param {object} intent
 */
export async function discoverFromPlan(prisma, searchPlan, intent = {}) {
  await ensureFederationReady();
  const discovered = [];
  const skipped = [];

  for (const step of searchPlan.steps || []) {
    const source = getSourceNode(step.sourceId);
    if (!source || source.status !== 'ACTIVE') {
      skipped.push({ stepId: step.id, reason: 'source_inactive' });
      continue;
    }

    if (step.protocol === PROTOCOL.CARDBEY_LIBRARY || step.protocol === PROTOCOL.CREATOR_STUDIO) {
      const rows = await discoverFromCardbeyLibrary(prisma, intent, step);
      discovered.push(...rows);
      continue;
    }

    if (step.protocol === PROTOCOL.CARDBEY_CAPABILITY) {
      const rows = await discoverFromCapabilities(prisma, intent);
      discovered.push(...rows);
      continue;
    }

    // Phase 5: Provider SDK adapters (Pexels, Openverse, Pixabay, Unsplash, …)
    const adapter = getAdapter(step.sourceId);
    if (adapter && typeof adapter.search === 'function') {
      const budget = consumeRateBudget(step.sourceId);
      if (!budget.ok) {
        skipped.push({ stepId: step.id, reason: budget.reason, sourceId: step.sourceId });
        continue;
      }
      try {
        const result = await adapter.search({
          query: step.derivedQuery || intent.utterance,
          derivedQuery: step.derivedQuery,
          mediaType: intent.mediaType || step.filters?.mediaType,
          orientation: intent.orientation || step.filters?.orientation,
          limit: 12,
          industry: intent.industry,
        });
        recordAdapterHealth(step.sourceId, {
          ok: result.ok !== false,
          status: result.ok === false ? 'DEGRADED' : 'ACTIVE',
          configured: result.configured,
          liveSearch: Boolean(result.live),
          error: result.error || null,
        });
        if (result.code === 'RATE_LIMITED') {
          openCircuit(step.sourceId, 120_000);
        }

        let rows = [];
        for (const hit of result.hits || []) {
          const normalized = normalizeAdapterHit(hit, {
            sourceId: step.sourceId,
            resourceClass: source.resourceClass,
            industry: intent.industry,
          });
          if (!normalized?.remoteId) continue;
          const rightsSuggestion = suggestRights({
            sourceId: step.sourceId,
            license: normalized.sourceMetadata?.license,
            rightsStatus: normalized.rightsSnapshot?.status,
            hostingMode: normalized.technical?.hostingMode,
          });
          let record = upsertResourceRecord({
            ...normalized,
            rightsSnapshot: {
              ...normalized.rightsSnapshot,
              status: rightsSuggestion.decision,
              aiSuggestion: rightsSuggestion.suggestion,
              policyPending: true,
            },
          });
          record = await enrichWithAiMetadata(record, intent);
          rows.push(record);
        }

        // Indexed fallback for Pexels when live empty
        if (rows.length === 0 && step.sourceId === 'src_pexels') {
          rows = await discoverFromIndexedExternal(prisma, 'pexels', intent);
          if (rows.length === 0) {
            skipped.push({
              stepId: step.id,
              reason: result.note || 'adapter_empty',
              sourceId: step.sourceId,
            });
          }
        } else if (rows.length === 0) {
          skipped.push({
            stepId: step.id,
            reason: result.note || result.error || 'adapter_empty',
            sourceId: step.sourceId,
          });
        }

        discovered.push(...rows);
      } catch (err) {
        openCircuit(step.sourceId, 60_000);
        recordAdapterHealth(step.sourceId, {
          ok: false,
          status: 'DEGRADED',
          error: String(err?.message || err),
        });
        skipped.push({
          stepId: step.id,
          reason: 'adapter_error',
          error: String(err?.message || err),
        });
      }
      continue;
    }

    skipped.push({ stepId: step.id, reason: 'no_adapter_or_protocol' });
  }

  const byId = new Map();
  for (const r of discovered) byId.set(r.id, r);

  return {
    ok: true,
    downloaded: false,
    hosted: false,
    candidates: [...byId.values()],
    skipped,
    count: byId.size,
    federation: true,
  };
}

async function discoverFromCardbeyLibrary(prisma, intent, step) {
  if (!prisma?.universalAsset) return [];
  const assets = await prisma.universalAsset.findMany({
    where: { status: 'PUBLISHED' },
    take: 80,
    orderBy: { updatedAt: 'desc' },
  });

  const out = [];
  for (const a of assets) {
    const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    if (meta.contentOrigin === 'DEVELOPMENT_FIXTURE') continue;
    const industry = String(meta.industry || (Array.isArray(a.categories) ? a.categories[0] : '') || '');
    if (intent.industry && industry && industry !== intent.industry) {
      if (!String(industry).includes(String(intent.industry).split('-')[0])) continue;
    }
    if (intent.mediaType && String(a.type).toLowerCase() !== String(intent.mediaType).toLowerCase()) {
      continue;
    }
    if (step.sourceId === 'src_cardbey_originals' && meta.source !== 'cardbey.originals') continue;
    if (step.sourceId === 'src_creator_studio' && a.provider !== 'creator_studio') continue;

    const rightsSuggestion = suggestRights({
      sourceId: step.sourceId,
      license: a.license,
      rightsStatus: a.rightsStatus,
      hostingMode: a.hostingMode,
    });

    let record = upsertResourceRecord({
      sourceId: step.sourceId,
      remoteId: a.id,
      canonicalUrl: null,
      previewUrl: a.preview || a.thumbnail || null,
      title: a.title,
      mediaType: a.type,
      industry: industry || intent.industry || null,
      resourceClass: 'CARDBEY',
      sourceMetadata: {
        provider: a.provider,
        license: a.license,
        categories: a.categories,
        creatorId: a.creatorId,
      },
      provenance: {
        system: 'universal_library',
        assetId: a.id,
        discoveredAt: new Date().toISOString(),
      },
      rightsSnapshot: {
        status: rightsSuggestion.decision,
        aiSuggestion: rightsSuggestion.suggestion,
        policyPending: true,
        authority: 'rights_intelligence_interface',
      },
      qualitySnapshot: { score: a.qualityScore || null },
      technical: { hostingMode: a.hostingMode },
      availability: { available: true, mode: 'platform_index' },
    });

    record = await enrichWithAiMetadata(record, intent);
    out.push(record);
    if (out.length >= 24) break;
  }
  return out;
}

async function discoverFromCapabilities(prisma, intent) {
  try {
    const rows = await prisma.$queryRawUnsafe(
      `SELECT "id","slug","name","summary","industry","capabilityType","status"
       FROM "Capability" WHERE "status" = 'PUBLISHED' LIMIT 20`,
    );
    return (rows || [])
      .filter((c) => !intent.industry || !c.industry || c.industry === intent.industry)
      .map((c) =>
        upsertResourceRecord({
          sourceId: 'src_cardbey_capability',
          remoteId: c.id,
          title: c.name,
          mediaType: 'capability',
          industry: c.industry,
          resourceClass: 'CARDBEY',
          sourceMetadata: {
            slug: c.slug,
            capabilityType: c.capabilityType,
            summary: c.summary,
          },
          provenance: { system: 'capability_engine', capabilityId: c.id },
          rightsSnapshot: { status: 'NEEDS_REVIEW', policyPending: true },
          availability: { available: true, mode: 'capability_reference' },
        }),
      );
  } catch {
    return [];
  }
}

async function discoverFromIndexedExternal(prisma, provider, intent) {
  if (!prisma?.universalAsset) return listResourceIndex({ sourceId: 'src_pexels', limit: 12 });
  const assets = await prisma.universalAsset.findMany({
    where: { status: 'PUBLISHED', provider },
    take: 40,
    orderBy: { updatedAt: 'desc' },
  });
  const out = [];
  for (const a of assets) {
    const meta = a.metadata && typeof a.metadata === 'object' ? a.metadata : {};
    const industry = String(meta.industry || '');
    if (intent.industry && industry && industry !== intent.industry) continue;
    const rightsSuggestion = suggestRights({
      sourceId: 'src_pexels',
      license: a.license,
      rightsStatus: a.rightsStatus,
      hostingMode: a.hostingMode,
    });
    let record = upsertResourceRecord({
      sourceId: 'src_pexels',
      remoteId: String(meta.providerRemoteId || a.id),
      canonicalUrl: a.sourceUrl || null,
      previewUrl: a.preview || a.thumbnail || null,
      title: a.title,
      mediaType: a.type,
      industry: industry || intent.industry,
      resourceClass: 'OPEN_MEDIA',
      sourceMetadata: {
        photographer: meta.creatorLabel || meta.attribution?.name,
        license: a.license,
      },
      provenance: { system: 'external_reference', provider, assetId: a.id },
      rightsSnapshot: {
        status: rightsSuggestion.decision,
        aiSuggestion: rightsSuggestion.suggestion,
        policyPending: true,
      },
      technical: { hostingMode: 'REFERENCE' },
      availability: { available: true, mode: 'reference_only' },
    });
    record = await enrichWithAiMetadata(record, intent);
    out.push(record);
    if (out.length >= 16) break;
  }
  return out;
}
