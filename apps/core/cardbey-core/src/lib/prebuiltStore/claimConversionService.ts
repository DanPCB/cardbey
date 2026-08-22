import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getBusinessCandidateById } from '../businessCandidate/candidateRepository.js';
import {
  getClaimConversionByHash,
  getPrebuiltDraftByCardId,
  getPrebuiltDraftByCandidateId,
  getPrebuiltDraftById,
  listClaimConversionRecords,
  saveClaimConversionRecord,
} from './draftRepository.js';
import {
  buildConversionPlan,
  markClaimStarted,
  markClaimVerified,
  markConverted,
} from './prebuiltDraftService.js';
import type {
  ClaimAuthorityProofType,
  ClaimConversionRecord,
  ConversionPlan,
} from './types.js';

function nowIso(): string {
  return new Date().toISOString();
}

function buildClaimToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sameTarget(a: ClaimConversionRecord, b: ClaimConversionRecord): boolean {
  return (
    (a.candidateId !== null && a.candidateId === b.candidateId) ||
    (a.cardId !== null && a.cardId === b.cardId)
  );
}

export async function initiateClaim(params: {
  candidateId?: string;
  cardId?: string;
}): Promise<{ claimToken: string; record: ClaimConversionRecord }> {
  if (!params.candidateId && !params.cardId) {
    throw new Error('candidateId or cardId is required');
  }
  const draft = params.candidateId
    ? await getPrebuiltDraftByCandidateId(params.candidateId)
    : await getPrebuiltDraftByCardId(params.cardId!);
  if (!draft) {
    throw new Error('No prebuilt draft found for claim target');
  }
  const claimToken = buildClaimToken();
  const now = nowIso();
  const record: ClaimConversionRecord = {
    id: randomUUID(),
    candidateId: params.candidateId ?? draft.candidateId,
    cardId: params.cardId ?? draft.cardId ?? null,
    draftId: draft.id,
    claimTokenHash: hashToken(claimToken),
    claimantId: null,
    proofType: null,
    verified: false,
    verifiedAt: null,
    convertedAt: null,
    status: 'INITIATED',
    conversionPlan: null,
    createdAt: now,
    updatedAt: now,
  };
  await saveClaimConversionRecord(record);
  await markClaimStarted(draft.id);
  return { claimToken, record };
}

export async function verifyClaimAuthority(params: {
  claimToken: string;
  proofType: ClaimAuthorityProofType;
  claimantId?: string | null;
}): Promise<{ verified: boolean; claim: ClaimConversionRecord }> {
  const claim = await getClaimConversionByHash(hashToken(params.claimToken));
  if (!claim) {
    throw new Error('Claim token not found');
  }
  const now = nowIso();
  const verified = Boolean(params.proofType);
  const updated: ClaimConversionRecord = {
    ...claim,
    claimantId: params.claimantId ?? claim.claimantId ?? null,
    proofType: params.proofType,
    verified,
    verifiedAt: verified ? claim.verifiedAt ?? now : null,
    status: verified ? 'VERIFIED' : 'REJECTED',
    updatedAt: now,
  };
  await saveClaimConversionRecord(updated);
  if (verified && updated.draftId) {
    await markClaimVerified(updated.draftId);
  }
  return { verified, claim: updated };
}

export async function confirmAndConvert(params: {
  claimToken: string;
  claimantId: string;
}): Promise<{
  ok: boolean;
  alreadyConverted: boolean;
  plan: ConversionPlan | null;
  message: string;
}> {
  const claim = await getClaimConversionByHash(hashToken(params.claimToken));
  if (!claim) {
    throw new Error('Claim token not found');
  }
  if (claim.status === 'CONVERTED' && claim.conversionPlan) {
    return {
      ok: true,
      alreadyConverted: true,
      plan: claim.conversionPlan as ConversionPlan,
      message: 'Claim already converted',
    };
  }
  if (!claim.verified) {
    throw new Error('Claim is not verified');
  }
  if (claim.claimantId && claim.claimantId !== params.claimantId) {
    throw new Error('Duplicate claimant blocked for this verified claim');
  }
  const allClaims = await listClaimConversionRecords();
  const conflictingClaim = allClaims.find(
    (row) =>
      row.id !== claim.id &&
      sameTarget(row, claim) &&
      (row.status === 'VERIFIED' || row.status === 'CONVERTED') &&
      row.claimantId &&
      row.claimantId !== params.claimantId,
  );
  if (conflictingClaim) {
    throw new Error('Another claimant already verified or converted this target');
  }
  if (!claim.draftId) {
    throw new Error('Claim is missing draft linkage');
  }
  const draft = await getPrebuiltDraftById(claim.draftId);
  if (!draft) {
    throw new Error('Linked draft not found');
  }
  const candidateId = claim.candidateId ?? draft.candidateId;
  const candidate = await getBusinessCandidateById(candidateId);
  if (!candidate) {
    throw new Error(`Candidate not found: ${candidateId}`);
  }
  const plan = buildConversionPlan({
    draft,
    candidate,
    claimVerified: true,
  });
  const now = nowIso();
  const updatedClaim: ClaimConversionRecord = {
    ...claim,
    claimantId: params.claimantId,
    status: 'CONVERTED',
    convertedAt: claim.convertedAt ?? now,
    conversionPlan: plan,
    updatedAt: now,
  };
  await saveClaimConversionRecord(updatedClaim);
  await markConverted(draft.id);
  return {
    ok: true,
    alreadyConverted: false,
    plan,
    message:
      'Conversion stub completed. Canonical store creation remains intentionally deferred until verified execution is wired.',
  };
}
