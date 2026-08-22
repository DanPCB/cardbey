/**
 * Phase 3 — Guard A (emailVerified) + Guard B (enrichment email mismatch → manual review).
 */
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { approveSeed } from '../QaPromotionService.js';
import {
  upsertSeedRecords,
  resetIngestionDataForTests,
  getSeedRecordById,
} from '../IngestionRepository.js';
import {
  startSeedClaim,
  verifySeedClaimProof,
} from '../ClaimBridgeService.js';
import {
  flagForManualReview,
  listManualReviewQueue,
  resetManualReviewsForTests,
} from '../claimManualReviewStore.js';
import { getPrismaClient } from '../../prisma.js';
import type { NormalizedBusinessRecord } from '../types.js';

vi.mock('../LiveDuplicateCheck.js', () => ({
  findLiveBusinessDuplicate: vi.fn(async () => ({ blocked: false })),
}));

vi.mock('../SeedOwnershipTransfer.js', () => ({
  transferSeedStoreToOwner: vi.fn(),
  ensureSeedStoreExists: vi.fn(),
}));

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'seed-p3-1',
    businessName: 'Lune Croissanterie Fitzroy',
    legalName: null,
    address: '176 Johnston St, Fitzroy',
    phone: '+61394190000',
    website: 'https://lunecroissanterie.com',
    category: 'bakery',
    categoryConfidence: 0.9,
    registrationNumber: null,
    email: 'info@lunecroissanterie.com',
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.85,
    sourceType: 'open_data_url',
    sourceReference: 'phase3',
    sourceRowId: '1',
    ingestedAt: now,
    ...overrides,
  };
}

async function seedClaimable(id: string, email: string | null = 'info@lunecroissanterie.com') {
  const normalized = makeNormalized({ id, email });
  const record = buildIngestedSeedRecord({
    normalized,
    qualityScore: 80,
    qualityTier: 'high_quality',
    resolution: 'unique',
    matchEvidence: [],
  });
  await upsertSeedRecords([record]);
  const approved = await approveSeed(id, 'admin-p3', 'ok');
  expect(approved.ok).toBe(true);
  return (await getSeedRecordById(id))!;
}

describe('Phase 3 claim guards', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'phase3-test',
      String(Date.now()),
    );
    process.env.BUSINESS_SEEDS_BACKEND = 'file';
    process.env.CLAIM_OTP_LIVE_OUTREACH = 'false';
    process.env.DEV_OTP_INBOX = 'dev@cardbey.com';
    process.env.NODE_ENV = 'test';
    await resetIngestionDataForTests();
    await resetManualReviewsForTests();
    const prisma = getPrismaClient();
    if (prisma.claimOtp) await prisma.claimOtp.deleteMany({});
  });

  afterEach(async () => {
    delete process.env.BUSINESS_INGESTION_DIR;
    delete process.env.BUSINESS_SEEDS_BACKEND;
  });

  it('Guard A: emailVerified=false rejected with EMAIL_NOT_VERIFIED before OTP consumed', async () => {
    const seed = await seedClaimable('p3-unverified');
    const started = await startSeedClaim({
      seedId: seed.id,
      claimantUserId: 'attacker-1',
      proofType: 'email',
      contact: 'info@lunecroissanterie.com',
      emailVerified: true,
      claimantEmail: 'info@lunecroissanterie.com',
    });
    expect(started.ok).toBe(true);
    expect(started.otp).toBeTruthy();

    const beforeCount = await getPrismaClient().claimOtp.count({
      where: { seedId: seed.id, usedAt: { not: null } },
    });

    const verified = await verifySeedClaimProof({
      seedId: seed.id,
      claimantUserId: 'attacker-1',
      otp: started.otp,
      emailVerified: false,
      claimantEmail: 'lune@attacker.com',
    });

    expect(verified.ok).toBe(false);
    expect(verified.code).toBe('EMAIL_NOT_VERIFIED');
    expect(verified.seed?.verificationStatus).toBe('claim_pending');

    const afterCount = await getPrismaClient().claimOtp.count({
      where: { seedId: seed.id, usedAt: { not: null } },
    });
    expect(afterCount).toBe(beforeCount);

    const row = await getPrismaClient().claimOtp.findFirst({
      where: { seedId: seed.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(row?.usedAt).toBeNull();
  });

  it('Guard A on start: emailVerified=false rejected before OTP issued', async () => {
    const seed = await seedClaimable('p3-start-unverified');
    const started = await startSeedClaim({
      seedId: seed.id,
      claimantUserId: 'attacker-2',
      proofType: 'email',
      contact: 'info@lunecroissanterie.com',
      emailVerified: false,
      claimantEmail: 'lune@attacker.com',
    });
    expect(started.ok).toBe(false);
    expect(started.code).toBe('EMAIL_NOT_VERIFIED');
    expect(started.claim).toBeNull();
  });

  it('emailVerified=true and email matches enrichmentEmail → verified_owner', async () => {
    const seed = await seedClaimable('p3-match');
    const started = await startSeedClaim({
      seedId: seed.id,
      claimantUserId: 'owner-match',
      proofType: 'email',
      contact: 'info@lunecroissanterie.com',
      emailVerified: true,
      claimantEmail: 'info@lunecroissanterie.com',
    });
    const verified = await verifySeedClaimProof({
      seedId: seed.id,
      claimantUserId: 'owner-match',
      otp: started.otp,
      emailVerified: true,
      claimantEmail: 'info@lunecroissanterie.com',
    });
    expect(verified.ok).toBe(true);
    expect(verified.pendingReview).toBeFalsy();
    expect(verified.seed?.verificationStatus).toBe('verified_owner');
  });

  it('emailVerified=true and email differs from enrichmentEmail → pending_review + flagForManualReview', async () => {
    const seed = await seedClaimable('p3-mismatch');
    const started = await startSeedClaim({
      seedId: seed.id,
      claimantUserId: 'owner-personal',
      proofType: 'email',
      contact: 'info@lunecroissanterie.com',
      emailVerified: true,
      claimantEmail: 'alex.owner@gmail.com',
    });
    const verified = await verifySeedClaimProof({
      seedId: seed.id,
      claimantUserId: 'owner-personal',
      otp: started.otp,
      emailVerified: true,
      claimantEmail: 'alex.owner@gmail.com',
    });

    expect(verified.ok).toBe(true);
    expect(verified.pendingReview).toBe(true);
    expect(verified.code).toBe('PENDING_REVIEW');
    expect(verified.message).toMatch(/under review/i);
    expect(verified.claim?.claimStatus).toBe('pending_review');
    expect(verified.seed?.verificationStatus).toBe('claim_pending');

    const queue = await listManualReviewQueue({ reason: 'email_mismatch' });
    expect(queue.length).toBeGreaterThanOrEqual(1);
    const row = queue.find((r) => r.seedId === seed.id);
    expect(row).toMatchObject({
      seedId: seed.id,
      userId: 'owner-personal',
      reason: 'email_mismatch',
      claimantEmail: 'alex.owner@gmail.com',
      enrichmentEmail: 'info@lunecroissanterie.com',
      status: 'pending',
    });
  });

  it('emailVerified=true and seed has no enrichmentEmail → proceeds normally', async () => {
    const seed = await seedClaimable('p3-no-enrich', null);
    const started = await startSeedClaim({
      seedId: seed.id,
      claimantUserId: 'owner-no-enrich',
      proofType: 'email',
      contact: 'personal@example.com',
      emailVerified: true,
      claimantEmail: 'personal@example.com',
    });
    const verified = await verifySeedClaimProof({
      seedId: seed.id,
      claimantUserId: 'owner-no-enrich',
      otp: started.otp,
      emailVerified: true,
      claimantEmail: 'personal@example.com',
    });
    expect(verified.ok).toBe(true);
    expect(verified.pendingReview).toBeFalsy();
    expect(verified.seed?.verificationStatus).toBe('verified_owner');
  });

  it('flagForManualReview creates reviewable admin queue record', async () => {
    const record = await flagForManualReview({
      seedId: 'seed-admin-q',
      userId: 'user-admin-q',
      reason: 'email_mismatch',
      claimantEmail: 'me@example.com',
      enrichmentEmail: 'info@business.com',
    });
    expect(record.id).toBeTruthy();
    const queue = await listManualReviewQueue({ status: 'pending' });
    expect(queue.some((r) => r.id === record.id && r.reason === 'email_mismatch')).toBe(true);
  });
});
