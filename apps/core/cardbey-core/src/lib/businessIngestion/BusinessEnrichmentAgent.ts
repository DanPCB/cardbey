/**
 * Business Enrichment Agent V2.2 — creates suggestions only (never overwrites seeds).
 */

import { getSeedRecordById } from './IngestionRepository.js';
import {
  listEnrichmentCandidates,
  updateEnrichmentCandidateStatus,
  upsertEnrichmentCandidate,
} from './EnrichmentCandidateStore.js';
import { extractSafeWebsiteEnrichmentFacts } from './websiteEnrichmentExtract.js';
import type { EnrichmentCandidate, IngestedSeedRecord } from './types.js';
import { buildEnrichmentMetrics } from './buildEnrichmentMetrics.js';
import { buildPerformerEnrichmentHandoff, buildPublicPreparedSuggestions } from './enrichmentPublic.js';
import { createMissionPipeline } from '../missionPipelineService.js';
import { createPerformerRuntimeContext } from '../runtime/performerRuntime/runtimeContext.js';
import { registerRuntimeContext } from '../runtime/performerRuntime/runtimeState.js';
import { markRuntimeOwnedContext } from '../runtime/performerRuntime/runtimeOwnership.js';
import { createSuitcaseItem } from '../../services/suitcase/suitcaseItemService.js';

export async function runBusinessEnrichmentForSeed(
  seedId: string,
): Promise<{ ok: boolean; created: number; message: string }> {
  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, created: 0, message: 'Seed not found.' };

  const website = seed.normalized.website?.trim();
  if (!website) {
    return { ok: true, created: 0, message: 'No website on record — enrichment skipped.' };
  }

  const facts = await extractSafeWebsiteEnrichmentFacts(website);
  let created = 0;
  for (const fact of facts) {
    const saved = await upsertEnrichmentCandidate({
      seedId,
      field: fact.field,
      value: fact.value,
      sourceUrl: fact.sourceUrl,
      confidence: fact.confidence,
      permissionType: fact.permissionType,
      status: 'suggested',
    });
    if (saved) created += 1;
  }

  return {
    ok: true,
    created,
    message: created ? `Created ${created} enrichment suggestion(s).` : 'No safe facts found.',
  };
}

export async function acceptEnrichmentSuggestionsViaRuntime(params: {
  seedId: string;
  userId: string;
  candidateIds: string[];
  confirmed?: boolean;
  missionId?: string | null;
}): Promise<{
  ok: boolean;
  message: string;
  accepted: EnrichmentCandidate[];
  handoff?: ReturnType<typeof buildPerformerEnrichmentHandoff>;
  suitcaseItemId?: string | null;
}> {
  const seedId = String(params.seedId ?? '').trim();
  const userId = String(params.userId ?? '').trim();
  if (!seedId || !userId) {
    return { ok: false, message: 'seedId and userId are required.', accepted: [] };
  }
  if (params.confirmed !== true) {
    return { ok: false, message: 'Owner confirmation is required.', accepted: [] };
  }
  if (!params.candidateIds?.length) {
    return { ok: false, message: 'Select at least one suggestion to accept.', accepted: [] };
  }

  const seed = await getSeedRecordById(seedId);
  if (!seed) return { ok: false, message: 'Business not found.', accepted: [] };

  const runtimeCtx = createPerformerRuntimeContext({
    userId,
    missionId: params.missionId ?? null,
  });
  registerRuntimeContext(runtimeCtx);
  markRuntimeOwnedContext(
    { missionId: params.missionId ?? null, userId, source: 'accept_enrichment_suggestion', seedId },
    runtimeCtx.runtimeId,
  );

  const accepted: EnrichmentCandidate[] = [];
  for (const id of params.candidateIds) {
    const candidate = (await listEnrichmentCandidates(seedId)).find((c) => c.id === id);
    if (!candidate || candidate.status !== 'suggested') continue;
    const updated = await updateEnrichmentCandidateStatus(id, 'accepted');
    if (updated) accepted.push(updated);
  }

  if (!accepted.length) {
    return { ok: false, message: 'No valid suggestions to accept.', accepted: [] };
  }

  let activationMissionId = params.missionId?.trim() || '';
  if (!activationMissionId) {
    const mission = await createMissionPipeline({
      type: 'store',
      title: `Apply enrichment: ${seed.normalized.businessName ?? 'Business'}`,
      createdBy: userId,
      metadata: {
        source: 'business_enrichment_agent',
        seedId,
        idempotencyKey: `accept-enrichment:${seedId}:${accepted.map((a) => a.id).join(',')}`,
      },
      requiresConfirmation: true,
      executionMode: 'MANUAL',
    });
    activationMissionId = mission?.id ?? '';
  }

  const handoff = buildPerformerEnrichmentHandoff(seed, accepted);
  let suitcaseItemId: string | null = null;
  try {
    const suitcase = await createSuitcaseItem({
      ownerId: userId,
      sourceType: 'mission_output',
      contentType: 'json',
      title: `Enrichment accepted: ${seed.normalized.businessName ?? 'Business'}`,
      idempotencyKey: `enrichment-accept:${seedId}:${accepted.map((a) => a.id).join(',')}`,
      metadata: {
        seedId,
        missionId: activationMissionId,
        performerId: runtimeCtx.runtimeId,
        enrichmentHandoff: handoff,
        acceptedCandidateIds: accepted.map((a) => a.id),
      },
    });
    suitcaseItemId = suitcase?.item?.id ?? null;
  } catch {
    suitcaseItemId = null;
  }

  return {
    ok: true,
    message: 'Suggestions accepted — Performer will apply updates.',
    accepted,
    handoff,
    suitcaseItemId,
  };
}

export { buildEnrichmentMetrics, buildPublicPreparedSuggestions, buildPerformerEnrichmentHandoff };

export function scheduleBusinessEnrichmentForSeed(seed: IngestedSeedRecord): void {
  if (process.env.NODE_ENV === 'test') return;
  void runBusinessEnrichmentForSeed(seed.id).catch(() => undefined);
}
