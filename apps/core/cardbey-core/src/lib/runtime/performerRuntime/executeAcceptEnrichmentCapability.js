/**
 * Performer runtime — accept_enrichment_suggestion (Business Enrichment V2.2).
 * Records accepted candidates + Performer handoff only — never writes store/profile fields.
 */

import { acceptEnrichmentSuggestionsViaRuntime } from '../../businessIngestion/BusinessEnrichmentAgent.js';
import { getRuntimeByMissionId } from './runtimeState.js';
import { markRuntimeOwnedContext } from './runtimeOwnership.js';
import { recordRuntimeAuthorityPathUsed } from './runtimeAuthorityGuard.js';

/**
 * @param {{
 *   missionId?: string | null;
 *   seedId: string;
 *   userId: string;
 *   candidateIds: string[];
 *   confirmed?: boolean;
 * }} params
 */
export async function executeAcceptEnrichmentCapability(params) {
  const seedId = String(params.seedId ?? '').trim();
  const userId = String(params.userId ?? '').trim();
  const missionId = typeof params.missionId === 'string' ? params.missionId.trim() : '';
  const candidateIds = Array.isArray(params.candidateIds)
    ? params.candidateIds.map((id) => String(id ?? '').trim()).filter(Boolean)
    : [];

  recordRuntimeAuthorityPathUsed({
    route: '/api/performer/runtime/capabilities/accept-enrichment-suggestion',
    toolName: 'accept_enrichment_suggestion',
    userId,
    missionId: missionId || null,
    source: 'business_enrichment_v22',
  });

  const runtimeCtx = missionId ? getRuntimeByMissionId(missionId) : null;
  const runtimeId = runtimeCtx?.runtimeId ?? `rt-enrich:${seedId}`;

  markRuntimeOwnedContext(
    {
      missionId: missionId || null,
      userId,
      source: 'performer_runtime_accept_enrichment',
      seedId,
    },
    runtimeId,
  );

  const result = await acceptEnrichmentSuggestionsViaRuntime({
    seedId,
    userId,
    candidateIds,
    confirmed: params.confirmed === true,
    missionId: missionId || null,
  });

  return {
    ok: result.ok,
    status: result.ok ? 'completed' : params.confirmed !== true ? 'blocked' : 'failed',
    output: result.ok
      ? {
          acceptedCandidateIds: result.accepted.map((c) => c.id),
          enrichmentHandoff: result.handoff ?? null,
          suitcaseItemId: result.suitcaseItemId ?? null,
        }
      : null,
    error: result.ok ? null : { message: result.message },
    code: result.ok ? null : params.confirmed !== true ? 'confirmation_required' : 'accept_enrichment_failed',
    message: result.message,
    missionId,
  };
}
