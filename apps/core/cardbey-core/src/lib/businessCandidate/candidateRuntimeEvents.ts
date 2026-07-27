/**
 * Runtime events for BusinessCandidate onboarding — Runtime Authority audit trail.
 */

import type { BusinessCandidateRecord, BusinessOnboardingRuntimeEventType } from './types.js';

async function emitPlatformActivity(input: Record<string, unknown>): Promise<void> {
  const { emitPlatformActivity: emit } = await import('../platformActivity/platformActivityEmitter.js');
  await emit(input);
}

export function emitCandidateRuntimeEvent(params: {
  type: BusinessOnboardingRuntimeEventType;
  candidate: BusinessCandidateRecord;
  actorId?: string | null;
  actorType?: 'admin' | 'user' | 'system' | 'performer';
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
}): void {
  const c = params.candidate;
  void emitPlatformActivity({
    type: params.type,
    severity: 'info',
    actorType: params.actorType ?? (params.actorId ? 'user' : 'system'),
    actorId: params.actorId ?? null,
    entityType: 'business_candidate',
    entityId: c.id,
    title: params.title,
    message: params.message,
    route: c.missionId ? `/console?missionId=${c.missionId}` : `/control-center/discovery-center?candidateId=${c.id}`,
    actionLabel: 'Open onboarding mission',
    region: c.suburb ?? c.city ?? null,
    metadata: {
      batchId: c.batchId,
      businessName: c.name,
      status: c.status,
      missionId: c.missionId,
      storeDraftId: c.storeDraftId,
      discoveredFrom: c.discoveredFrom,
      ...(params.metadata ?? {}),
    },
  }).catch(() => {});
}

export function emitBusinessDiscovered(candidate: BusinessCandidateRecord): void {
  emitCandidateRuntimeEvent({
    type: 'business_discovered',
    candidate,
    title: 'Business discovered',
    message: `${candidate.name ?? 'Business'} added to ${candidate.batchId}.`,
    metadata: { discoveredFrom: candidate.discoveredFrom, confidenceScore: candidate.confidenceScore },
  });
}

export function emitCandidateStatusChanged(
  candidate: BusinessCandidateRecord,
  fromStatus: string,
  action: string,
  actorId?: string | null,
): void {
  emitCandidateRuntimeEvent({
    type: 'candidate_status_changed',
    candidate,
    actorId,
    title: 'Onboarding stage updated',
    message: `${candidate.name ?? 'Business'}: ${fromStatus} → ${candidate.status}`,
    metadata: { fromStatus, toStatus: candidate.status, action },
  });
}
