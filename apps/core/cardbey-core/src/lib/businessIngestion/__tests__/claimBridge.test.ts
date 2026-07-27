/**

 * Claim & Verification Bridge tests (V1.2).

 */



import path from 'node:path';

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { buildIngestedSeedRecord } from '../SeedGovernance.js';

import { approveSeed } from '../QaPromotionService.js';

import { upsertSeedRecords, resetIngestionDataForTests, getSeedRecordById } from '../IngestionRepository.js';

import { listClaimAuditEntries } from '../ClaimAuditLog.js';

import { listClaimRequests } from '../ClaimRequestStore.js';

import {

  canPubliclyClaim,

  buildPublicClaimPreview,

  startSeedClaim,

  verifySeedClaimProof,

  activateSeedAfterOwnerConfirmation,

  rejectSeedClaim,

  buildClaimQueueMetrics,

} from '../ClaimBridgeService.js';

import { setClaimOtp } from '../../discovery/claimOtpStore.js';

import type { IngestedSeedRecord, NormalizedBusinessRecord } from '../types.js';

import { getSeedRecordById } from '../IngestionRepository.js';



const findLiveDuplicateMock = vi.fn();

const transferMock = vi.fn();



vi.mock('../LiveDuplicateCheck.js', () => ({

  findLiveBusinessDuplicate: (...args: unknown[]) => findLiveDuplicateMock(...args),

}));



vi.mock('../SeedOwnershipTransfer.js', () => ({

  transferSeedStoreToOwner: (...args: unknown[]) => transferMock(...args),

  ensureSeedStoreExists: vi.fn(),

}));



function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {

  const now = new Date().toISOString();

  return {

    id: overrides.id ?? 'seed-claim-1',

    businessName: 'Claimable Cafe',

    legalName: null,

    address: '10 Main St, Melbourne, VIC, Australia',

    phone: '+61400111222',

    website: 'https://claimable.example.com',

    category: 'cafe',

    categoryConfidence: 0.85,

    registrationNumber: 'ABN12345678901',

    email: 'owner@claimable.example.com',

    operatingRegion: 'AU-VIC',

    country: 'Australia',

    state: 'VIC',

    city: 'Melbourne',

    confidenceScore: 0.8,

    sourceType: 'open_data_url',

    sourceReference: 'fixture',

    sourceRowId: '1',

    ingestedAt: now,

    ...overrides,

  };

}



function makeSeed(overrides: Partial<IngestedSeedRecord> = {}): IngestedSeedRecord {

  const normalized = makeNormalized(

    overrides.normalized as Partial<NormalizedBusinessRecord> | undefined,

  );

  const base = buildIngestedSeedRecord({

    normalized,

    resolution: overrides.resolution ?? 'unique',

    matchEvidence: overrides.matchEvidence ?? [],

    qualityScore: overrides.qualityScore ?? 88,

    qualityTier: overrides.qualityTier ?? 'high_quality',

  });

  return { ...base, ...overrides, normalized };

}



async function seedClaimable(id = 'seed-claim-1'): Promise<IngestedSeedRecord> {

  let seed = makeSeed({ normalized: { id } });

  await upsertSeedRecords([seed]);

  await approveSeed(id, 'admin-qa');

  const approved = await getSeedRecordById(id);

  if (!approved) throw new Error('approve failed');

  return approved;

}



describe('Claim Bridge V1.2', () => {

  beforeEach(async () => {

    process.env.BUSINESS_INGESTION_DIR = path.join(

      process.cwd(),

      'data',

      'businessIngestion',

      'claim-test',

      String(Date.now()),

    );

    process.env.NODE_ENV = 'test';

    await resetIngestionDataForTests();

    findLiveDuplicateMock.mockReset();

    transferMock.mockReset();

    findLiveDuplicateMock.mockResolvedValue({

      blocked: false,

      matchedBusinessId: null,

      evidence: [],

    });

    transferMock.mockResolvedValue({ ok: true, storeId: 'store-linked-1', draftId: 'draft-1' });

  });



  it('public preview masks contact and exposes claim CTA for seeded_claimable', async () => {

    const seed = await seedClaimable('preview-1');

    const preview = buildPublicClaimPreview(seed);

    expect(preview?.businessName).toBe('Claimable Cafe');

    expect(preview?.city).toBe('Melbourne');

    expect(preview?.sourceConfidence).toBe(0.8);

    expect(preview?.maskedPhone).toMatch(/\*\*\*/);

    expect(preview?.maskedEmail).toContain('@');

    expect(preview?.claimable).toBe(true);

    expect(preview?.claimCtaPath).toContain('preview-1');

  });



  it('seeded_claimable can start claim with otp_sent status', async () => {

    const seed = await seedClaimable('start-1');

    const result = await startSeedClaim({

      seedId: seed.id,

      claimantUserId: 'user-owner-1',

      proofType: 'email',

      contact: 'owner@claimable.example.com',

    });

    expect(result.ok).toBe(true);

    expect(result.claim?.proofStatus).toBe('pending');

    expect(result.claim?.claimStatus).toBe('otp_sent');

    expect(result.claim?.expiresAt).toBeTruthy();

    expect(result.requiresOtp).toBe(true);

    const afterStart = await getSeedRecordById(seed.id);
    expect(afterStart?.verificationStatus).toBe('claim_pending');

    const audit = await listClaimAuditEntries({ seedId: seed.id });

    expect(audit.some((e) => e.action === 'claim_started')).toBe(true);

    expect(audit.some((e) => e.action === 'otp_sent')).toBe(true);

    expect(audit.some((e) => e.action === 'proof_submitted')).toBe(true);

  });



  it('seeded_pending_qa cannot be claimed publicly', async () => {

    const pending = makeSeed({ normalized: { id: 'pending-1' } });

    await upsertSeedRecords([pending]);

    const gate = canPubliclyClaim(pending);

    expect(gate.ok).toBe(false);

    const result = await startSeedClaim({

      seedId: pending.id,

      claimantUserId: 'user-1',

      proofType: 'email',

      contact: 'owner@claimable.example.com',

    });

    expect(result.ok).toBe(false);

  });



  it('rejected and duplicate seeds cannot be claimed', async () => {

    const rejected = makeSeed({ normalized: { id: 'rej-1' }, verificationStatus: 'rejected' });

    rejected.claimable = false;

    const dup = makeSeed({

      normalized: { id: 'dup-1' },

      verificationStatus: 'duplicate',

      resolution: 'duplicate',

    });

    dup.claimable = false;

    await upsertSeedRecords([rejected, dup]);



    expect(

      (await startSeedClaim({

        seedId: rejected.id,

        claimantUserId: 'u1',

        proofType: 'email',

        contact: 'a@b.com',

      })).ok,

    ).toBe(false);

    expect(

      (await startSeedClaim({

        seedId: dup.id,

        claimantUserId: 'u1',

        proofType: 'email',

        contact: 'a@b.com',

      })).ok,

    ).toBe(false);

  });



  it('valid email OTP promotes seed to verified_owner without creating store', async () => {

    const seed = await seedClaimable('verify-1');

    await startSeedClaim({

      seedId: seed.id,

      claimantUserId: 'user-verify-1',

      proofType: 'email',

      contact: 'owner@claimable.example.com',

    });

    setClaimOtp(`ingestion-seed:${seed.id}`, 'user-verify-1', '123456');



    const verified = await verifySeedClaimProof({

      seedId: seed.id,

      claimantUserId: 'user-verify-1',

      otp: '123456',

    });



    expect(verified.ok).toBe(true);

    expect(verified.seed?.verificationStatus).toBe('verified_owner');

    expect(verified.seed?.ownerUserId).toBe('user-verify-1');

    expect(verified.seed?.storeId).toBeNull();

    expect(verified.seed?.verifiedAt).toBeTruthy();

    expect(verified.seed?.verificationDurationMs).toBeGreaterThanOrEqual(0);

    expect(transferMock).not.toHaveBeenCalled();



    const audit = await listClaimAuditEntries({ seedId: seed.id });

    expect(audit.some((e) => e.action === 'proof_verified')).toBe(true);

  });



  it('activation requires confirmed true', async () => {

    const seed = await seedClaimable('activate-guard-1');

    const verified = {

      ...seed,

      verificationStatus: 'verified_owner' as const,

      ownerUserId: 'user-act-1',

      claimable: false,

    };

    await upsertSeedRecords([verified]);



    const denied = await activateSeedAfterOwnerConfirmation({

      seedId: verified.id,

      ownerUserId: 'user-act-1',

      confirmed: false,

    });

    expect(denied.ok).toBe(false);

    expect(transferMock).not.toHaveBeenCalled();

  });



  it('activation creates owner-linked store and moves seed to active', async () => {

    const seed = await seedClaimable('activate-1');

    await startSeedClaim({

      seedId: seed.id,

      claimantUserId: 'user-act-1',

      proofType: 'email',

      contact: 'owner@claimable.example.com',

    });

    setClaimOtp(`ingestion-seed:${seed.id}`, 'user-act-1', '654321');

    await verifySeedClaimProof({

      seedId: seed.id,

      claimantUserId: 'user-act-1',

      otp: '654321',

    });



    const result = await activateSeedAfterOwnerConfirmation({

      seedId: seed.id,

      ownerUserId: 'user-act-1',

      confirmed: true,

    });

    expect(result.ok).toBe(true);

    expect(result.seed?.verificationStatus).toBe('active');

    expect(result.seed?.storeId).toBe('store-linked-1');

    expect(result.seed?.activatedAt).toBeTruthy();

    expect(result.seed?.operatingStartedAt).toBeTruthy();

    expect(result.seed?.activationDurationMs).toBeGreaterThanOrEqual(0);

    expect(result.seed?.publicVisibility).toBe('full');

    expect(transferMock).toHaveBeenCalled();



    const claims = await listClaimRequests();

    expect(claims.find((c) => c.seedId === seed.id)?.claimStatus).toBe('activated');



    const audit = await listClaimAuditEntries({ seedId: seed.id });

    expect(audit.some((e) => e.action === 'seed_activated')).toBe(true);

  });



  it('duplicate live store blocks verification', async () => {

    findLiveDuplicateMock.mockResolvedValue({

      blocked: true,

      matchedBusinessId: 'live-biz-99',

      evidence: [{ field: 'phone', signal: 'exact', score: 0.65 }],

    });



    const seed = await seedClaimable('dup-block-1');

    await startSeedClaim({

      seedId: seed.id,

      claimantUserId: 'user-dup-1',

      proofType: 'registration',

      contact: 'ABN12345678901',

    });



    const result = await verifySeedClaimProof({

      seedId: seed.id,

      claimantUserId: 'user-dup-1',

      proofValue: 'ABN12345678901',

    });



    expect(result.ok).toBe(false);

    expect(result.duplicateBlocked).toBe(true);

    const claims = await listClaimRequests();

    expect(claims.find((c) => c.seedId === seed.id)?.claimStatus).toBe('duplicate_blocked');



    const audit = await listClaimAuditEntries({ seedId: seed.id });

    expect(audit.some((e) => e.action === 'duplicate_blocked')).toBe(true);

  });



  it('duplicate live store blocks activation', async () => {

    const seed = await seedClaimable('dup-act-1');

    const verified = {

      ...seed,

      verificationStatus: 'verified_owner' as const,

      ownerUserId: 'user-dup-act',

      claimable: false,

    };

    await upsertSeedRecords([verified]);



    findLiveDuplicateMock.mockResolvedValue({

      blocked: true,

      matchedBusinessId: 'live-biz-88',

      evidence: [],

    });



    const result = await activateSeedAfterOwnerConfirmation({

      seedId: verified.id,

      ownerUserId: 'user-dup-act',

      confirmed: true,

    });

    expect(result.ok).toBe(false);

    expect(result.duplicateBlocked).toBe(true);

    expect(transferMock).not.toHaveBeenCalled();

  });



  it('admin reject writes audit event', async () => {

    const seed = await seedClaimable('reject-1');

    const started = await startSeedClaim({

      seedId: seed.id,

      claimantUserId: 'user-rej-1',

      proofType: 'email',

      contact: 'owner@claimable.example.com',

    });

    const rejected = await rejectSeedClaim({

      seedId: seed.id,

      claimRequestId: started.claim!.id,

      reviewerId: 'admin-1',

      reason: 'Suspicious contact',

    });

    expect(rejected.ok).toBe(true);

    expect(rejected.claim?.claimStatus).toBe('rejected');



    const audit = await listClaimAuditEntries({ seedId: seed.id });

    expect(audit.some((e) => e.action === 'claim_rejected')).toBe(true);

  });



  it('metrics reflect claim and activation counts', async () => {

    const seed = await seedClaimable('metrics-1');

    await startSeedClaim({

      seedId: seed.id,

      claimantUserId: 'user-metrics',

      proofType: 'email',

      contact: 'owner@claimable.example.com',

    });



    const metrics = await buildClaimQueueMetrics();

    expect(metrics.pendingClaims).toBeGreaterThanOrEqual(1);

    expect(metrics.claimRate).toBeGreaterThanOrEqual(0);

    expect(metrics.verificationRate).toBeGreaterThanOrEqual(0);

    expect(typeof metrics.activationRate).toBe('number');

    expect(typeof metrics.operatingConversionRate).toBe('number');

    expect(metrics.stalledActivationCount).toBeGreaterThanOrEqual(0);

  });

});


