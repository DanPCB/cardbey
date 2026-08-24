/**
 * Brief download + claim intent orchestration.
 * Never creates Store or publishes.
 */

import type { CandidateIntelligenceBrief } from './types.js';
import { getBriefByCandidateId, getBriefBySeedId, saveBrief } from './briefRepository.js';
import {
  generateBusinessIntelligenceBrief,
  generateBusinessIntelligenceBriefForSeed,
} from './generateBusinessIntelligenceBrief.js';
import { isSeedBriefCandidateId } from '../seedBriefAdapter.js';
import { getSeedRecordById } from '../../businessIngestion/IngestionRepository.js';
import {
  createOrUpdateClaimIntent,
  hasClaimIntentForDownload,
} from '../claimIntent/claimIntentService.js';
import type { ClaimIntentSource, ClaimIntentRecord } from '../claimIntent/types.js';
import { getBusinessCandidateById } from '../candidateRepository.js';

export type BriefDownloadIntentResult =
  | { ok: true; action: 'download'; brief: CandidateIntelligenceBrief }
  | { ok: true; action: 'claim_required'; claimUrl: string; message: string }
  | { ok: true; action: 'registration_required'; message: string }
  | { ok: false; error: string };

export async function getOrGenerateBrief(
  candidateId: string,
  regenerate = false,
  seedId?: string | null,
): Promise<CandidateIntelligenceBrief | null> {
  if (!regenerate) {
    const existing =
      (await getBriefByCandidateId(candidateId)) ??
      (seedId ? await getBriefBySeedId(seedId) : null);
    if (existing && existing.status !== 'draft') return existing;
  }

  if (isSeedBriefCandidateId(candidateId) && seedId) {
    const seed = await getSeedRecordById(seedId);
    if (!seed) return null;
    return generateBusinessIntelligenceBriefForSeed(seed);
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
  const seedId = params.seedId ?? null;
  const candidate = isSeedBriefCandidateId(params.candidateId)
    ? null
    : await getBusinessCandidateById(params.candidateId);
  if (!candidate && !seedId) return { ok: false, error: 'Candidate not found' };

  if (!params.userId) {
    return {
      ok: true,
      action: 'registration_required',
      message: 'Sign in or create an account to download the Business Intelligence Brief and start your claim.',
    };
  }

  const resolvedSeedId = seedId ?? candidate?.seedId ?? null;
  await createOrUpdateClaimIntent({
    candidateId: candidate?.id ?? params.candidateId,
    seedId: resolvedSeedId,
    userId: params.userId,
    email: params.email,
    source: 'BI_BRIEF_DOWNLOAD',
    sessionId: params.sessionId,
  });

  const brief = await getOrGenerateBrief(params.candidateId, false, resolvedSeedId);
  if (!brief) return { ok: false, error: 'Brief not available' };

  const updated: CandidateIntelligenceBrief = {
    ...brief,
    status: 'claim_started',
    claimStartedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await saveBrief(updated);

  if (resolvedSeedId) {
    return {
      ok: true,
      action: 'claim_required',
      claimUrl: `/activate-business/${resolvedSeedId}`,
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
  const seedId = params.seedId ?? null;
  const candidate = isSeedBriefCandidateId(params.candidateId)
    ? null
    : await getBusinessCandidateById(params.candidateId);
  if (!candidate && !seedId) return { ok: false, error: 'Candidate not found' };

  if (!params.userId) {
    return {
      ok: true,
      action: 'registration_required',
      message: 'Sign in or create an account to download the Business Intelligence Brief.',
    };
  }

  const allowed = await hasClaimIntentForDownload({
    candidateId: params.candidateId,
    seedId: seedId ?? candidate?.seedId ?? null,
    userId: params.userId,
    sessionId: params.sessionId,
  });

  if (!allowed) {
    const resolvedSeedId = seedId ?? candidate?.seedId ?? null;
    return {
      ok: true,
      action: 'claim_required',
      claimUrl: resolvedSeedId
        ? `/activate-business/${resolvedSeedId}`
        : `/business-candidates/${params.candidateId}`,
      message: 'Start your claim before downloading the brief.',
    };
  }

  let brief = await getOrGenerateBrief(params.candidateId, false, seedId ?? candidate?.seedId);
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
  businessSlug?: string | null;
  evaluationId?: string | null;
  graphId?: string | null;
  userId?: string | null;
  sessionId?: string | null;
  source?: ClaimIntentSource;
}): Promise<ClaimIntentRecord> {
  const { getBusinessCandidateBySeedId } = await import('../candidateRepository.js');
  const candidate =
    params.candidateId != null
      ? await getBusinessCandidateById(params.candidateId)
      : await getBusinessCandidateBySeedId(params.seedId);

  return createOrUpdateClaimIntent({
    candidateId: candidate?.id ?? params.candidateId ?? null,
    seedId: params.seedId,
    businessSlug: params.businessSlug ?? null,
    evaluationId: params.evaluationId ?? null,
    graphId: params.graphId ?? null,
    userId: params.userId ?? null,
    source: params.source ?? 'CLAIM_BUTTON',
    sessionId: params.sessionId ?? null,
  });
}
