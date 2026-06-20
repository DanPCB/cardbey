/**

 * Claim & Verification Bridge (V1.2).

 * Connects seeded_claimable records to OTP patterns and store ownership transfer.

 */



import {

  generateOtp,

  setClaimOtp,

  verifyClaimOtp,

  clearClaimOtp,

} from '../discovery/claimOtpStore.js';

import { websiteHost, normalizePhone } from '../businessDiscovery/businessDataNormalizer.js';

import { maskEmail, maskPhone } from './contactMasking.js';

import { appendClaimAuditEntry } from './ClaimAuditLog.js';

import { withActivationDurations, averageDurationMs, isActivationStalled } from './activationTiming.js';

import { emitSeedActivationActivity } from './activationActivityEmitter.js';

import {

  createClaimRequest,

  getActiveClaimForSeed,

  getVerifiedClaimForSeed,

  saveClaimRequest,

  listClaimRequests,

} from './ClaimRequestStore.js';

import { getSeedRecordById, listSeedRecords, upsertSeedRecords } from './IngestionRepository.js';

import { findLiveBusinessDuplicate } from './LiveDuplicateCheck.js';

import { applySeedStatusTransition } from './SeedGovernance.js';

import { transferSeedStoreToOwner } from './SeedOwnershipTransfer.js';

import { recordSeedLifecycleTransition } from './BusinessSeedStatusTransitionRepository.js';

import {
  claimedLifecycleStage,
  toGovernedLifecycleStage,
} from './seedLifecycleGovernance.js';

import type {

  ClaimProofType,

  ClaimQueueMetrics,

  IngestedSeedRecord,

  IngestionClaimRequest,

  PublicClaimPreview,

} from './types.js';



const OTP_PROOF_TYPES = new Set<ClaimProofType>(['email', 'phone']);

const OPEN_CLAIM_STATUSES = new Set(['pending', 'otp_sent', 'proof_submitted']);



function otpKey(seedId: string): string {

  return `ingestion-seed:${seedId}`;

}



function isClaimExpired(claim: IngestionClaimRequest): boolean {

  if (!claim.expiresAt) return false;

  return Date.now() > new Date(claim.expiresAt).getTime();

}



async function expireClaimIfNeeded(

  claim: IngestionClaimRequest,

  actorId: string,

): Promise<IngestionClaimRequest> {

  if (!isClaimExpired(claim) || claim.claimStatus === 'expired') return claim;

  const expired: IngestionClaimRequest = {

    ...claim,

    claimStatus: 'expired',

    proofStatus: 'rejected',

    updatedAt: new Date().toISOString(),

    rejectionReason: 'Claim expired.',

  };

  await saveClaimRequest(expired);

  clearClaimOtp(otpKey(claim.seedId));

  await appendClaimAuditEntry({

    seedId: claim.seedId,

    claimRequestId: claim.id,

    action: 'claim_expired',

    actorId,

    previousStatus: claim.claimStatus,

    nextStatus: 'expired',

    reason: 'Claim window elapsed.',

  });

  return expired;

}



export function canPubliclyClaim(seed: IngestedSeedRecord): { ok: boolean; message: string } {

  if (seed.verificationStatus !== 'seeded_claimable') {

    return {

      ok: false,

      message: `This business is not open for claims (status: ${seed.verificationStatus}).`,

    };

  }

  return { ok: true, message: 'OK' };

}



export function buildPublicClaimPreview(seed: IngestedSeedRecord): PublicClaimPreview | null {

  const gate = canPubliclyClaim(seed);

  const n = seed.normalized;

  if (!n.businessName) return null;



  return {

    seedId: seed.id,

    businessName: n.businessName,

    city: n.city,

    category: n.category,

    maskedPhone: maskPhone(n.phone),

    maskedEmail: maskEmail(n.email),

    sourceConfidence: n.confidenceScore ?? null,

    claimable: gate.ok,

    claimCtaPath: `/api/business-ingestion/seeds/${seed.id}/claim`,

  };

}



export async function getPublicClaimPreviewBySeedId(

  seedId: string,

): Promise<{ ok: boolean; preview: PublicClaimPreview | null; message?: string }> {

  const seed = await getSeedRecordById(seedId);

  if (!seed) return { ok: false, preview: null, message: 'Business not found.' };

  const preview = buildPublicClaimPreview(seed);

  if (!preview) return { ok: false, preview: null, message: 'Preview unavailable.' };

  return { ok: true, preview };

}



function normalizeProofContact(proofType: ClaimProofType, contact: string): string | null {

  const trimmed = contact.trim();

  if (!trimmed) return null;

  if (proofType === 'email') return trimmed.toLowerCase();

  if (proofType === 'phone') return normalizePhone(trimmed);

  if (proofType === 'website') return websiteHost(trimmed) ?? trimmed.toLowerCase();

  return trimmed.toUpperCase();

}



export async function startSeedClaim(params: {

  seedId: string;

  claimantUserId: string;

  proofType: ClaimProofType;

  contact: string;

}): Promise<{

  ok: boolean;

  claim: IngestionClaimRequest | null;

  requiresOtp: boolean;

  otp?: string;

  message: string;

}> {

  const seed = await getSeedRecordById(params.seedId);

  if (!seed) return { ok: false, claim: null, requiresOtp: false, message: 'Seed not found.' };



  const gate = canPubliclyClaim(seed);

  if (!gate.ok) return { ok: false, claim: null, requiresOtp: false, message: gate.message };



  const proofContact = normalizeProofContact(params.proofType, params.contact);

  if (!proofContact) {

    return { ok: false, claim: null, requiresOtp: false, message: 'Valid contact is required.' };

  }



  let existing = await getActiveClaimForSeed(params.seedId, params.claimantUserId);

  if (existing) {

    existing = await expireClaimIfNeeded(existing, params.claimantUserId);

    if (OPEN_CLAIM_STATUSES.has(existing.claimStatus)) {

      return {

        ok: true,

        claim: existing,

        requiresOtp: OTP_PROOF_TYPES.has(existing.proofType),

        message: 'Claim already in progress.',

      };

    }

  }



  const claim = await createClaimRequest({

    seedId: params.seedId,

    claimantUserId: params.claimantUserId,

    proofType: params.proofType,

    proofContact,

  });



  const claimStartedAt = claim.claimStartedAt ?? claim.createdAt;

  const transition = applySeedStatusTransition(seed, 'claim_pending');

  if (!transition.ok) {

    return { ok: false, claim: null, requiresOtp: false, message: transition.message };

  }

  await upsertSeedRecords([

    {

      ...transition.record,

      claimStartedAt: seed.claimStartedAt ?? claimStartedAt,

      claimable: false,

      updatedAt: claimStartedAt,

    },

  ]);

  await recordSeedLifecycleTransition({

    seedId: params.seedId,

    fromStatus: seed.verificationStatus,

    toStatus: 'claim_pending',

    lifecycleStage: 'claim_pending',

    action: 'claim_start',

    actorId: params.claimantUserId,

    actorType: 'user',

    claimRequestId: claim.id,

    metadata: { proofType: params.proofType },

  });



  await appendClaimAuditEntry({

    seedId: params.seedId,

    claimRequestId: claim.id,

    action: 'claim_started',

    actorId: params.claimantUserId,

    previousStatus: seed.verificationStatus,

    nextStatus: claim.claimStatus,

    metadata: { proofType: params.proofType },

  });

  const claimBusinessName = seed.normalized?.businessName ?? 'A business';

  const claimRegion = seed.normalized?.country ?? seed.normalized?.city ?? null;

  void import('../platformActivity/platformActivityEmitter.js')

    .then(({ emitPlatformActivity }) =>

      emitPlatformActivity({

        type: 'business_claim_started',

        severity: 'info',

        actorType: 'user',

        actorId: params.claimantUserId,

        entityType: 'business_seed',

        entityId: params.seedId,

        title: 'Business claim started',

        message: `${claimBusinessName} began ownership verification.`,

        route: '/admin/discovery',

        region: claimRegion,

        metadata: { claimRequestId: claim.id },

      }),

    )

    .catch(() => {});

  emitSeedActivationActivity({

    type: 'ownership_verification_started',

    seed: { ...seed, claimStartedAt: seed.claimStartedAt ?? claimStartedAt },

    actorId: params.claimantUserId,

    title: 'Ownership verification started',

    message: `${claimBusinessName} began ownership verification.`,

    metadata: { claimRequestId: claim.id },

  });



  await appendClaimAuditEntry({

    seedId: params.seedId,

    claimRequestId: claim.id,

    action: 'proof_submitted',

    actorId: params.claimantUserId,

    previousStatus: 'pending',

    nextStatus: 'proof_submitted',

    metadata: { proofType: params.proofType, proofStatus: 'pending' },

  });



  let requiresOtp = false;

  let otp: string | undefined;

  let updatedClaim = claim;



  if (OTP_PROOF_TYPES.has(params.proofType)) {

    requiresOtp = true;

    otp = generateOtp();

    setClaimOtp(otpKey(params.seedId), params.claimantUserId, otp);

    updatedClaim = {

      ...claim,

      claimStatus: 'otp_sent',

      updatedAt: new Date().toISOString(),

    };

    await saveClaimRequest(updatedClaim);

    await appendClaimAuditEntry({

      seedId: params.seedId,

      claimRequestId: claim.id,

      action: 'otp_sent',

      actorId: params.claimantUserId,

      previousStatus: 'proof_submitted',

      nextStatus: 'otp_sent',

      metadata: { proofType: params.proofType },

    });

  } else {

    updatedClaim = {

      ...claim,

      claimStatus: 'proof_submitted',

      updatedAt: new Date().toISOString(),

    };

    await saveClaimRequest(updatedClaim);

  }



  return {

    ok: true,

    claim: updatedClaim,

    requiresOtp,

    ...(process.env.NODE_ENV !== 'production' && otp ? { otp } : {}),

    message: requiresOtp

      ? 'Claim started. Verify with the OTP sent to your contact.'

      : 'Claim started. Submit proof for verification.',

  };

}



function verifyNonOtpProof(

  seed: IngestedSeedRecord,

  claim: IngestionClaimRequest,

  proofValue: string,

): boolean {

  const n = seed.normalized;

  const normalized = normalizeProofContact(claim.proofType, proofValue);

  if (!normalized) return false;



  if (claim.proofType === 'registration') {

    const reg = (n.registrationNumber ?? '').toUpperCase();

    return Boolean(reg && reg === normalized);

  }

  if (claim.proofType === 'website') {

    const seedHost = websiteHost(n.website);

    return Boolean(seedHost && seedHost === normalized);

  }

  return normalized === claim.proofContact;

}



export async function verifySeedClaimProof(params: {

  seedId: string;

  claimantUserId: string;

  otp?: string | null;

  proofValue?: string | null;

}): Promise<{

  ok: boolean;

  claim: IngestionClaimRequest | null;

  seed: IngestedSeedRecord | null;

  message: string;

  duplicateBlocked?: boolean;

}> {

  const seed = await getSeedRecordById(params.seedId);

  if (!seed) return { ok: false, claim: null, seed: null, message: 'Seed not found.' };



  if (seed.verificationStatus !== 'claim_pending') {

    return {

      ok: false,

      claim: null,

      seed,

      message: `Claim verification requires claim_pending (current: ${seed.verificationStatus}).`,

    };

  }



  let claim = await getActiveClaimForSeed(params.seedId, params.claimantUserId);

  if (!claim || !OPEN_CLAIM_STATUSES.has(claim.claimStatus)) {

    return { ok: false, claim: null, seed, message: 'No pending claim found for this user.' };

  }



  claim = await expireClaimIfNeeded(claim, params.claimantUserId);

  if (claim.claimStatus === 'expired') {

    return { ok: false, claim, seed, message: 'Claim expired. Start a new claim.' };

  }



  let proofValid = false;

  if (OTP_PROOF_TYPES.has(claim.proofType)) {

    const otp = String(params.otp ?? '').trim();

    if (!otp) return { ok: false, claim, seed, message: 'OTP is required.' };

    proofValid = verifyClaimOtp(otpKey(params.seedId), params.claimantUserId, otp);

    if (!proofValid) {

      const failed: IngestionClaimRequest = {

        ...claim,

        attempts: (claim.attempts ?? 0) + 1,

        updatedAt: new Date().toISOString(),

      };

      await saveClaimRequest(failed);

      return { ok: false, claim: failed, seed, message: 'Invalid or expired OTP.' };

    }

  } else {

    const value = String(params.proofValue ?? claim.proofContact ?? '').trim();

    proofValid = verifyNonOtpProof(seed, claim, value);

    if (!proofValid) {

      const failed: IngestionClaimRequest = {

        ...claim,

        attempts: (claim.attempts ?? 0) + 1,

        updatedAt: new Date().toISOString(),

      };

      await saveClaimRequest(failed);

      return { ok: false, claim: failed, seed, message: 'Proof does not match seed records.' };

    }

  }



  const dup = await findLiveBusinessDuplicate(seed, seed.storeId);

  if (dup.blocked) {

    const blockedClaim: IngestionClaimRequest = {

      ...claim,

      proofStatus: 'rejected',

      claimStatus: 'duplicate_blocked',

      duplicateBlockedStoreId: dup.matchedBusinessId,

      updatedAt: new Date().toISOString(),

      rejectionReason: 'Live store duplicate detected.',

    };

    await saveClaimRequest(blockedClaim);

    await appendClaimAuditEntry({

      seedId: params.seedId,

      claimRequestId: claim.id,

      action: 'duplicate_blocked',

      actorId: params.claimantUserId,

      previousStatus: claim.claimStatus,

      nextStatus: 'duplicate_blocked',

      reason: 'Live store duplicate detected.',

      metadata: { matchedBusinessId: dup.matchedBusinessId, evidence: dup.evidence, phase: 'verify' },

    });

    return {

      ok: false,

      claim: blockedClaim,

      seed,

      message: 'A matching business already exists. Claim routed to admin review.',

      duplicateBlocked: true,

    };

  }



  const verifiedAt = new Date().toISOString();

  const verifiedClaim: IngestionClaimRequest = {

    ...claim,

    proofStatus: 'verified',

    claimStatus: 'verified',

    verifiedAt,

    claimStartedAt: claim.claimStartedAt ?? claim.createdAt,

    updatedAt: verifiedAt,

  };

  await saveClaimRequest(verifiedClaim);

  clearClaimOtp(otpKey(params.seedId));



  await appendClaimAuditEntry({

    seedId: params.seedId,

    claimRequestId: claim.id,

    action: 'proof_verified',

    actorId: params.claimantUserId,

    previousStatus: claim.claimStatus,

    nextStatus: 'verified',

    metadata: { proofType: claim.proofType },

  });



  const transition = applySeedStatusTransition(seed, 'verified_owner');

  if (!transition.ok) {

    return { ok: false, claim: verifiedClaim, seed, message: transition.message };

  }



  const updatedSeed: IngestedSeedRecord = withActivationDurations({

    ...transition.record,

    ownerUserId: params.claimantUserId,

    claimable: false,

    verifiedAt,

    claimStartedAt: seed.claimStartedAt ?? verifiedClaim.claimStartedAt ?? verifiedClaim.createdAt,

    updatedAt: verifiedAt,

  });

  await upsertSeedRecords([updatedSeed]);

  await recordSeedLifecycleTransition({

    seedId: params.seedId,

    fromStatus: 'claim_pending',

    toStatus: 'verified_owner',

    lifecycleStage: claimedLifecycleStage(),

    action: 'claim_verify',

    actorId: params.claimantUserId,

    actorType: 'user',

    claimRequestId: claim.id,

    metadata: { proofType: claim.proofType, phase: 'ownership_verified' },

  });

  await recordSeedLifecycleTransition({

    seedId: params.seedId,

    fromStatus: 'verified_owner',

    toStatus: 'verified_owner',

    lifecycleStage: toGovernedLifecycleStage('verified_owner'),

    action: 'claim_verify',

    actorId: params.claimantUserId,

    actorType: 'user',

    claimRequestId: claim.id,

    metadata: { proofType: claim.proofType, phase: 'activation_ready' },

  });

  emitSeedActivationActivity({

    type: 'ownership_verified',

    seed: updatedSeed,

    actorId: params.claimantUserId,

    severity: 'success',

    title: 'Ownership verified',

    message: `${updatedSeed.normalized?.businessName ?? 'Business'} ownership verified.`,

    metadata: { claimRequestId: claim.id },

  });

  void import('../platformActivity/platformActivityEmitter.js')

    .then(({ emitPlatformActivity }) =>

      emitPlatformActivity({

        type: 'business_claim_verified',

        severity: 'success',

        actorType: 'user',

        actorId: params.claimantUserId,

        entityType: 'business_seed',

        entityId: params.seedId,

        title: 'Business claim verified',

        message: `${updatedSeed.normalized?.businessName ?? 'Business'} completed ownership verification.`,

        route: `/activate-business/${params.seedId}`,

        metadata: { claimRequestId: claim.id },

      }),

    )

    .catch(() => {});



  return {

    ok: true,

    claim: verifiedClaim,

    seed: updatedSeed,

    message: 'Ownership verified. Confirm activation to publish your store.',

  };

}



export async function activateSeedAfterOwnerConfirmation(params: {

  seedId: string;

  ownerUserId: string;

  confirmed?: boolean;

  actorIsPlatformAdmin?: boolean;

}): Promise<{

  ok: boolean;

  seed: IngestedSeedRecord | null;

  message: string;

  duplicateBlocked?: boolean;

}> {

  const seed = await getSeedRecordById(params.seedId);

  if (!seed) return { ok: false, seed: null, message: 'Seed not found.' };

  if (seed.verificationStatus !== 'verified_owner') {

    return {

      ok: false,

      seed,

      message: `Activation requires verified_owner (current: ${seed.verificationStatus}).`,

    };

  }

  if (seed.ownerUserId !== params.ownerUserId && !params.actorIsPlatformAdmin) {

    return { ok: false, seed, message: 'Only the verified owner may activate this store.' };

  }

  if (params.confirmed !== true) {

    return { ok: false, seed, message: 'Owner confirmation is required (confirmed: true).' };

  }



  const dup = await findLiveBusinessDuplicate(seed, seed.storeId);

  if (dup.blocked) {

    const activeClaim = await getVerifiedClaimForSeed(params.seedId, seed.ownerUserId ?? undefined);

    if (activeClaim) {

      const blockedClaim: IngestionClaimRequest = {

        ...activeClaim,

        claimStatus: 'duplicate_blocked',

        proofStatus: 'rejected',

        duplicateBlockedStoreId: dup.matchedBusinessId,

        updatedAt: new Date().toISOString(),

        rejectionReason: 'Activation blocked — duplicate live store.',

      };

      await saveClaimRequest(blockedClaim);

    }

    await appendClaimAuditEntry({

      seedId: params.seedId,

      claimRequestId: activeClaim?.id ?? null,

      action: 'duplicate_blocked',

      actorId: params.ownerUserId,

      previousStatus: seed.verificationStatus,

      nextStatus: seed.verificationStatus,

      reason: 'Activation blocked — duplicate live store detected.',

      metadata: { matchedBusinessId: dup.matchedBusinessId, phase: 'activation' },

    });

    await recordSeedLifecycleTransition({

      seedId: params.seedId,

      fromStatus: seed.verificationStatus,

      toStatus: seed.verificationStatus,

      lifecycleStage: toGovernedLifecycleStage(seed.verificationStatus),

      action: 'activation_blocked_duplicate',

      actorId: params.ownerUserId,

      actorType: 'user',

      claimRequestId: activeClaim?.id ?? null,

      metadata: { matchedBusinessId: dup.matchedBusinessId, phase: 'activation' },

    });

    return {

      ok: false,

      seed,

      message: 'Activation blocked — duplicate live store detected.',

      duplicateBlocked: true,

    };

  }



  const ownerId = seed.ownerUserId ?? params.ownerUserId;

  const transfer = await transferSeedStoreToOwner(seed, ownerId);

  if (!transfer.ok) {

    return { ok: false, seed, message: transfer.error ?? 'Store creation failed.' };

  }



  const transition = applySeedStatusTransition(seed, 'active');

  if (!transition.ok) return { ok: false, seed, message: transition.message };



  const activatedAt = new Date().toISOString();



  const activatedSeed: IngestedSeedRecord = withActivationDurations({

    ...transition.record,

    ownerUserId: ownerId,

    storeId: transfer.storeId ?? transition.record.storeId,

    draftId: transfer.draftId ?? transition.record.draftId,

    publicVisibility: 'full',

    claimable: false,

    activatedAt,

    operatingStartedAt: activatedAt,

    verifiedAt: seed.verifiedAt ?? activatedAt,

    claimStartedAt: seed.claimStartedAt,

    updatedAt: activatedAt,

  });

  await upsertSeedRecords([activatedSeed]);

  const verifiedClaim = await getVerifiedClaimForSeed(params.seedId, ownerId);

  await recordSeedLifecycleTransition({

    seedId: params.seedId,

    fromStatus: seed.verificationStatus,

    toStatus: 'active',

    lifecycleStage: toGovernedLifecycleStage('active'),

    action: 'activation_confirmed',

    actorId: params.ownerUserId,

    actorType: params.actorIsPlatformAdmin ? 'admin' : 'user',

    claimRequestId: verifiedClaim?.id ?? null,

    metadata: {

      storeId: activatedSeed.storeId,

      draftId: activatedSeed.draftId,

      runtimeAuthority: true,

    },

  });

  if (verifiedClaim) {

    await saveClaimRequest({

      ...verifiedClaim,

      claimStatus: 'activated',

      activatedAt,

      updatedAt: activatedAt,

    });

  }



  await appendClaimAuditEntry({

    seedId: params.seedId,

    claimRequestId: verifiedClaim?.id ?? null,

    action: 'seed_activated',

    actorId: params.ownerUserId,

    previousStatus: 'verified_owner',

    nextStatus: 'active',

    metadata: { storeId: activatedSeed.storeId, activatedAt },

  });



  emitSeedActivationActivity({

    type: 'business_space_activated',

    seed: activatedSeed,

    actorId: params.ownerUserId,

    severity: 'success',

    title: 'Business Space activated',

    message: `${activatedSeed.normalized?.businessName ?? 'Business'} Business Space is live.`,

    metadata: { storeId: activatedSeed.storeId },

  });

  void import('../platformActivity/platformActivityEmitter.js')

    .then(({ emitPlatformActivity }) =>

      emitPlatformActivity({

        type: 'business_activated',

        severity: 'success',

        actorType: 'user',

        actorId: params.ownerUserId,

        entityType: 'business_seed',

        entityId: params.seedId,

        title: 'Business activated',

        message: `${activatedSeed.normalized?.businessName ?? 'Business'} store activated.`,

        route: `/activate-business/${params.seedId}`,

        metadata: { storeId: activatedSeed.storeId },

      }),

    )

    .catch(() => {});



  return { ok: true, seed: activatedSeed, message: 'Store activated.' };

}



export async function rejectSeedClaim(params: {

  seedId: string;

  claimRequestId: string;

  reviewerId: string;

  reason?: string | null;

}): Promise<{ ok: boolean; claim: IngestionClaimRequest | null; message: string }> {

  const claims = await listClaimRequests();

  const claim = claims.find((c) => c.id === params.claimRequestId && c.seedId === params.seedId);

  if (!claim) return { ok: false, claim: null, message: 'Claim not found.' };



  const updated: IngestionClaimRequest = {

    ...claim,

    proofStatus: 'rejected',

    claimStatus: 'rejected',

    rejectionReason: params.reason?.trim() || 'Rejected by admin.',

    updatedAt: new Date().toISOString(),

  };

  await saveClaimRequest(updated);

  clearClaimOtp(otpKey(params.seedId));



  await appendClaimAuditEntry({

    seedId: params.seedId,

    claimRequestId: claim.id,

    action: 'claim_rejected',

    actorId: params.reviewerId,

    previousStatus: claim.claimStatus,

    nextStatus: 'rejected',

    reason: updated.rejectionReason,

  });

  const seed = await getSeedRecordById(params.seedId);

  if (seed?.verificationStatus === 'claim_pending') {

    const revert = applySeedStatusTransition(seed, 'seeded_claimable');

    if (revert.ok) {

      await upsertSeedRecords([{ ...revert.record, claimable: true }]);

      await recordSeedLifecycleTransition({

        seedId: params.seedId,

        fromStatus: 'claim_pending',

        toStatus: 'seeded_claimable',

        lifecycleStage: 'qa_approved',

        action: 'claim_reject',

        actorId: params.reviewerId,

        actorType: 'admin',

        claimRequestId: claim.id,

        reason: updated.rejectionReason,

      });

    }

  }

  return { ok: true, claim: updated, message: 'Claim rejected.' };

}



export async function listClaimsByStatus(

  status?: IngestionClaimRequest['claimStatus'],

): Promise<IngestionClaimRequest[]> {

  const all = await listClaimRequests();

  if (!status) return all;

  if (status === 'pending') {

    return all.filter((c) => OPEN_CLAIM_STATUSES.has(c.claimStatus));

  }

  return all.filter((c) => c.claimStatus === status);

}



export async function buildClaimQueueMetrics(): Promise<ClaimQueueMetrics> {

  const [all, seeds] = await Promise.all([listClaimRequests(), listSeedRecords()]);

  const claimable = seeds.filter((s) => s.verificationStatus === 'seeded_claimable').length;

  const claimPending = seeds.filter((s) => s.verificationStatus === 'claim_pending').length;

  const verifiedOwner = seeds.filter((s) => s.verificationStatus === 'verified_owner').length;

  const active = seeds.filter((s) => s.verificationStatus === 'active').length;

  const claimed = verifiedOwner + active;

  const stalledActivationCount = seeds.filter((s) => isActivationStalled(s)).length;

  const verificationDurations = seeds

    .map((s) => s.verificationDurationMs)

    .filter((v): v is number => typeof v === 'number');

  const activationDurations = seeds

    .map((s) => s.activationDurationMs)

    .filter((v): v is number => typeof v === 'number');



  return {

    pendingClaims: all.filter((c) => OPEN_CLAIM_STATUSES.has(c.claimStatus)).length,

    verifiedClaims: all.filter((c) => c.claimStatus === 'verified').length,

    rejectedClaims: all.filter((c) => c.claimStatus === 'rejected').length,

    duplicateBlocked: all.filter((c) => c.claimStatus === 'duplicate_blocked').length,

    activatedSeeds: active,

    claimRate: seeds.length ? claimed / seeds.length : 0,

    verificationRate: seeds.length ? (verifiedOwner + active) / seeds.length : 0,

    activationRate: claimable + claimed > 0 ? active / (claimable + claimed) : 0,

    operatingConversionRate:

      verifiedOwner + active > 0 ? active / (verifiedOwner + active) : 0,

    averageVerificationDurationMs: averageDurationMs(verificationDurations),

    averageActivationDurationMs: averageDurationMs(activationDurations),

    stalledActivationCount,

  };

}



export async function enrichClaimsForDashboard(

  claims: IngestionClaimRequest[],

): Promise<

  Array<

    IngestionClaimRequest & {

      seedBusinessName: string | null;

      seedCity: string | null;

      seedVerificationStatus: string | null;

    }

  >

> {

  return Promise.all(

    claims.map(async (claim) => {

      const seed = await getSeedRecordById(claim.seedId);

      return {

        ...claim,

        seedBusinessName: seed?.normalized.businessName ?? null,

        seedCity: seed?.normalized.city ?? null,

        seedVerificationStatus: seed?.verificationStatus ?? null,

      };

    }),

  );

}


