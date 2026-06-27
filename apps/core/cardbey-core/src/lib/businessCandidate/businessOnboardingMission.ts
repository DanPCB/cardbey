/**
 * Business Onboarding Mission — one canonical Performer mission per BusinessCandidate.
 * GUIDED_RUN: conversation drives onboarding; no wizard.
 */

import { createMissionPipeline } from '../missionPipelineService.js';
import type { BusinessCandidateRecord } from './types.js';
import { attachMissionToCandidate } from './candidateLifecycle.js';
import { emitCandidateRuntimeEvent } from './candidateRuntimeEvents.js';

export async function createBusinessOnboardingMission(
  candidate: BusinessCandidateRecord,
  createdBy?: string | null,
): Promise<{ candidate: BusinessCandidateRecord; missionId: string }> {
  if (candidate.missionId) {
    return { candidate, missionId: candidate.missionId };
  }

  const idempotencyKey = `business-onboarding:${candidate.batchId}:${candidate.id}`;

  const mission = await createMissionPipeline({
    type: 'business_onboarding',
    title: `Onboard: ${candidate.name ?? 'Business'}`,
    targetType: 'generic',
    targetId: candidate.id,
    targetLabel: candidate.name ?? undefined,
    createdBy: createdBy ?? undefined,
    requiresConfirmation: true,
    executionMode: 'GUIDED_RUN',
    metadata: {
      source: 'batch_onboarding',
      candidateId: candidate.id,
      batchId: candidate.batchId,
      campaignId: candidate.campaignId,
      goal: 'Prepare this business for publication.',
      idempotencyKey,
      discoveredFrom: candidate.discoveredFrom,
      missingFields: candidate.missingFields,
      locale: 'en-AU',
    },
  });

  const missionId = mission?.id ?? '';
  if (!missionId) {
    throw new Error('Failed to create business onboarding mission');
  }

  const updated = await attachMissionToCandidate(candidate, missionId);

  emitCandidateRuntimeEvent({
    type: 'business_discovered',
    candidate: updated,
    actorType: 'system',
    title: 'Onboarding mission created',
    message: `Performer mission started for ${candidate.name ?? 'Business'}.`,
    metadata: { missionId, idempotencyKey },
  });

  return { candidate: updated, missionId };
}
