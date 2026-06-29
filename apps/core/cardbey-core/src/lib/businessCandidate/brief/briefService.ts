/**
 * Brief download + claim intent orchestration.
 * Never creates Store or publishes.
 */

import type { CandidateIntelligenceBrief } from './types.js';
import { getBriefByCandidateId, saveBrief } from './briefRepository.js';
import { generateBusinessIntelligenceBrief } from './generateBusinessIntelligenceBrief.js';
import {
  createOrUpdateClaimIntent,
  hasClaimIntentForDownload,
} from '../claimIntent/claimIntentService.js';
import type { ClaimIntentSource } from '../claimIntent/types.js';
import { getBusinessCandidateById } from '../candidateRepository.js';

export type BriefDownloadIntentResult =
  | { ok: true; action: 'download'; brief: CandidateIntelligenceBrief }
  | { ok: true; action: 'claim_required'; claimUrl: string; message: string }
  | { ok: true; action: 'registration_required'; message: string }
  | { ok: false; error: string };

export async function getOrGenerateBrief(
  candidateId: string,
  regenerate = false,
): Promise<CandidateIntelligenceBrief | null> {
  if (!regenerate) {
    const existing = await getBriefByCandidateId(candidateId);
    if (existing && existing.status !== 'draft') return existing;
  }
  return generateBusinessIntelligenceBrief(candidateId);
}

export async function recordBriefDownloadIntent(params: {
  candidateId: string;
  seedId?: string | null;
  userId?: string | null;
  email?: string | null;
  sessionId?: string | null;
}): Promise<BriefDownloadIntentResult> {
  const candidate = await getBusinessCandidateById(params.candidateId);
  if (!candidate) return { ok: false, error: 'Candidate not found' };

  if (!params.userId) {
    return {
      ok: true,
      action: 'registration_required',
      message: 'Sign in or create an account to download the Business Intelligence Brief and start your claim.',
    };
  }

  const seedId = params.seedId ?? candidate.seedId;
  await createOrUpdateClaimIntent({
    candidateId: params.candidateId,
    seedId,
    userId: params.userId,
    email: params.email,
    source: 'BI_BRIEF_DOWNLOAD',
    sessionId: params.sessionId,
  });

  const brief = await getOrGenerateBrief(params.candidateId);
  if (!brief) return { ok: false, error: 'Brief not available' };

  const updated: CandidateIntelligenceBrief = {
    ...brief,
    status: 'claim_started',
    claimStartedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveBrief(updated);

  if (seedId) {
    return {
      ok: true,
      action: 'claim_required',
      claimUrl: `/activate-business/${seedId}`,
      message: 'Claim intent recorded. Continue verification to download your brief.',
    };
  }

  return {
    ok: true,
    action: 'download',
    brief: updated,
  };
}

export async function downloadBriefIfAllowed(params: {
  candidateId: string;
  seedId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  format?: 'markdown' | 'html';
}): Promise<BriefDownloadIntentResult> {
  const candidate = await getBusinessCandidateById(params.candidateId);
  if (!candidate) return { ok: false, error: 'Candidate not found' };

  if (!params.userId) {
    return {
      ok: true,
      action: 'registration_required',
      message: 'Sign in or create an account to download the Business Intelligence Brief.',
    };
  }

  const allowed = await hasClaimIntentForDownload({
    candidateId: params.candidateId,
    seedId: params.seedId ?? candidate.seedId,
    userId: params.userId,
    sessionId: params.sessionId,
  });

  if (!allowed) {
    const seedId = params.seedId ?? candidate.seedId;
    return {
      ok: true,
      action: 'claim_required',
      claimUrl: seedId ? `/activate-business/${seedId}` : `/business-candidates/${params.candidateId}`,
      message: 'Start your claim before downloading the brief.',
    };
  }

  let brief = await getOrGenerateBrief(params.candidateId);
  if (!brief) return { ok: false, error: 'Brief not generated' };

  const now = new Date().toISOString();
  brief = {
    ...brief,
    status: brief.status === 'claim_started' ? 'downloaded' : brief.status,
    downloadedAt: now,
    updatedAt: now,
  };
  await saveBrief(brief);

  return { ok: true, action: 'download', brief };
}

export async function recordClaimButtonIntent(params: {
  candidateId?: string | null;
  seedId: string;
  userId?: string | null;
  sessionId?: string | null;
  source?: ClaimIntentSource;
}): Promise<void> {
  const { getBusinessCandidateBySeedId } = await import('../candidateRepository.js');
  const candidate =
    params.candidateId != null
      ? await getBusinessCandidateById(params.candidateId)
      : await getBusinessCandidateBySeedId(params.seedId);

  await createOrUpdateClaimIntent({
    candidateId: candidate?.id ?? params.candidateId ?? null,
    seedId: params.seedId,
    userId: params.userId ?? null,
    source: params.source ?? 'CLAIM_BUTTON',
    sessionId: params.sessionId ?? null,
  });
}
