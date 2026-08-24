/**
 * ClaimIntent service — never creates Store or publishes.
 */

import type { ClaimIntentSource, ClaimIntentRecord } from './types.js';
import {
  findClaimIntent,
  getClaimIntentById,
  newClaimIntentId,
  saveClaimIntent,
} from './claimIntentRepository.js';

export { getClaimIntentById };

export function toPublicClaimIntentResponse(
  intent: ClaimIntentRecord,
  extras?: { businessSlug?: string | null },
) {
  const businessSlug = extras?.businessSlug ?? intent.businessSlug ?? null;
  return {
    ok: true,
    claimIntentId: intent.id,
    claimUrl: `/claim-business/${intent.id}`,
    seedId: intent.seedId ?? null,
    businessSlug,
    status: intent.status,
    intent: {
      ...intent,
      businessSlug,
      evaluationId: intent.evaluationId ?? null,
      graphId: intent.graphId ?? null,
    },
  };
}

export async function createOrUpdateClaimIntent(params: {
  candidateId?: string | null;
  seedId?: string | null;
  businessSlug?: string | null;
  evaluationId?: string | null;
  graphId?: string | null;
  userId?: string | null;
  email?: string | null;
  source: ClaimIntentSource;
  sessionId?: string | null;
}): Promise<ClaimIntentRecord> {
  const now = new Date().toISOString();
  const existing = await findClaimIntent({
    candidateId: params.candidateId,
    seedId: params.seedId,
    userId: params.userId,
    sessionId: params.sessionId,
  });

  if (existing) {
    const updated: ClaimIntentRecord = {
      ...existing,
      source: params.source,
      businessSlug: params.businessSlug ?? existing.businessSlug ?? null,
      evaluationId: params.evaluationId ?? existing.evaluationId ?? null,
      graphId: params.graphId ?? existing.graphId ?? null,
      userId: params.userId ?? existing.userId,
      email: params.email ?? existing.email,
      sessionId: params.sessionId ?? existing.sessionId,
      status: params.userId ? 'registered' : existing.status,
      updatedAt: now,
    };
    return saveClaimIntent(updated);
  }

  const intent: ClaimIntentRecord = {
    id: newClaimIntentId(),
    candidateId: params.candidateId ?? null,
    seedId: params.seedId ?? null,
    businessSlug: params.businessSlug ?? null,
    evaluationId: params.evaluationId ?? null,
    graphId: params.graphId ?? null,
    userId: params.userId ?? null,
    email: params.email ?? null,
    source: params.source,
    status: params.userId ? 'registered' : 'started',
    sessionId: params.sessionId ?? null,
    createdAt: now,
    updatedAt: now,
  };
  return saveClaimIntent(intent);
}

export async function hasClaimIntentForDownload(params: {
  candidateId?: string | null;
  seedId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
}): Promise<boolean> {
  const intent = await findClaimIntent(params);
  return intent != null && intent.status !== 'abandoned';
}
