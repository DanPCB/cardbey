/**
 * ClaimIntent service — never creates Store or publishes.
 */

import type { ClaimIntentSource, ClaimIntentRecord } from './types.js';
import {
  findClaimIntent,
  newClaimIntentId,
  saveClaimIntent,
} from './claimIntentRepository.js';

export async function createOrUpdateClaimIntent(params: {
  candidateId?: string | null;
  seedId?: string | null;
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
