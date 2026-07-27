/**
 * Governed seed lifecycle — transitions, audit, claim_pending state.
 */

import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { canTransitionSeedStatus } from '../SeedGovernance.js';
import {
  approveSeed,
  rejectSeed,
} from '../QaPromotionService.js';
import {
  startSeedClaim,
  verifySeedClaimProof,
} from '../ClaimBridgeService.js';
import { setClaimOtp } from '../../discovery/claimOtpStore.js';
import {
  upsertSeedRecords,
  resetIngestionDataForTests,
  getSeedRecordById,
} from '../IngestionRepository.js';
import {
  listSeedLifecycleTransitions,
  resetSeedLifecycleTransitionsForTests,
  recordSeedLifecycleTransition,
} from '../BusinessSeedStatusTransitionRepository.js';
import { resetSeedTransitionBackendCacheForTests } from '../businessSeedStatusTransitionBackend.js';
import {
  buildSeedLifecycleFunnel,
  toGovernedLifecycleStage,
  GOVERNED_NON_STORE_ACTIONS,
} from '../seedLifecycleGovernance.js';
import type { NormalizedBusinessRecord } from '../types.js';

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'lifecycle-seed-1',
    businessName: 'Lifecycle Cafe',
    legalName: null,
    address: '1 High St',
    phone: '+61400111222',
    website: 'https://lifecycle.example.com',
    category: 'cafe',
    categoryConfidence: 0.85,
    registrationNumber: null,
    email: 'owner@lifecycle.example.com',
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.8,
    sourceType: 'open_data_url',
    sourceReference: 'test',
    sourceRowId: '1',
    ingestedAt: now,
    ...overrides,
  };
}

describe('seedLifecycleGovernance', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'lifecycle-test',
      String(Date.now()),
    );
    process.env.BUSINESS_SEEDS_BACKEND = 'file';
    resetSeedTransitionBackendCacheForTests();
    await resetIngestionDataForTests();
  });

  afterEach(async () => {
    delete process.env.BUSINESS_INGESTION_DIR;
    delete process.env.BUSINESS_SEEDS_BACKEND;
    resetSeedTransitionBackendCacheForTests();
  });

  it('maps internal statuses to governed lifecycle stages', () => {
    expect(toGovernedLifecycleStage('seeded_pending_qa')).toBe('seeded_pending_qa');
    expect(toGovernedLifecycleStage('seeded_claimable')).toBe('qa_approved');
    expect(toGovernedLifecycleStage('claim_pending')).toBe('claim_pending');
    expect(toGovernedLifecycleStage('verified_owner')).toBe('activation_ready');
    expect(toGovernedLifecycleStage('active')).toBe('activated_store');
    expect(toGovernedLifecycleStage('rejected')).toBe('qa_rejected');
  });

  it('allows claim_pending transition from qa_approved only', () => {
    expect(canTransitionSeedStatus('seeded_claimable', 'claim_pending')).toBe(true);
    expect(canTransitionSeedStatus('seeded_pending_qa', 'claim_pending')).toBe(false);
    expect(canTransitionSeedStatus('claim_pending', 'verified_owner')).toBe(true);
  });

  it('records audit on QA approve and reject', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized(),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    await upsertSeedRecords([seed]);

    await approveSeed(seed.id, 'admin-qa', 'Approved');
    let transitions = await listSeedLifecycleTransitions({ seedId: seed.id });
    expect(transitions.some((t) => t.action === 'qa_approve' && t.lifecycleStage === 'qa_approved')).toBe(
      true,
    );

    const claimable = await getSeedRecordById(seed.id);
    expect(claimable?.storeId).toBeNull();

    await rejectSeed(seed.id, 'admin-qa', 'Rejected after review');
    transitions = await listSeedLifecycleTransitions({ seedId: seed.id });
    expect(transitions.some((t) => t.action === 'qa_reject')).toBe(true);
  });

  it('claim flow: qa_approved → claim_pending → activation_ready without store', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized({ id: 'claim-flow-1' }),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    await upsertSeedRecords([seed]);
    await approveSeed(seed.id, 'admin-1', 'ok');

    const started = await startSeedClaim({
      seedId: seed.id,
      claimantUserId: 'owner-user',
      proofType: 'email',
      contact: 'owner@lifecycle.example.com',
    });
    expect(started.ok).toBe(true);

    const pending = await getSeedRecordById(seed.id);
    expect(pending?.verificationStatus).toBe('claim_pending');
    expect(pending?.storeId).toBeNull();

    setClaimOtp(`ingestion-seed:${seed.id}`, 'owner-user', '654321');
    const verified = await verifySeedClaimProof({
      seedId: seed.id,
      claimantUserId: 'owner-user',
      otp: '654321',
    });
    expect(verified.ok).toBe(true);
    expect(verified.seed?.verificationStatus).toBe('verified_owner');
    expect(verified.seed?.storeId).toBeNull();

    const transitions = await listSeedLifecycleTransitions({ seedId: seed.id });
    expect(transitions.some((t) => t.action === 'claim_start')).toBe(true);
    expect(transitions.some((t) => t.action === 'claim_verify')).toBe(true);
  });

  it('buildSeedLifecycleFunnel aggregates governed stages', () => {
    const funnel = buildSeedLifecycleFunnel({
      seeded_pending_qa: 5,
      seeded_claimable: 3,
      claim_pending: 2,
      verified_owner: 1,
      active: 4,
      rejected: 1,
      duplicate: 0,
    });
    expect(funnel.seeded_pending_qa).toBe(5);
    expect(funnel.qa_approved).toBe(3);
    expect(funnel.claim_pending).toBe(2);
    expect(funnel.activation_ready).toBe(1);
    expect(funnel.activated_store).toBe(4);
  });
});

describe('BusinessSeedStatusTransition DB persistence', () => {
  beforeEach(async () => {
    resetSeedTransitionBackendCacheForTests();
    process.env.BUSINESS_SEEDS_BACKEND = 'db';
    delete process.env.BUSINESS_INGESTION_DIR;
    await resetSeedLifecycleTransitionsForTests();
  });

  afterEach(async () => {
    delete process.env.BUSINESS_SEEDS_BACKEND;
    resetSeedTransitionBackendCacheForTests();
    await resetSeedLifecycleTransitionsForTests();
  });

  it('persists lifecycle transitions to business_seed_status_transition table', async () => {
    await recordSeedLifecycleTransition({
      seedId: 'db-seed-1',
      fromStatus: 'seeded_pending_qa',
      toStatus: 'seeded_claimable',
      lifecycleStage: 'qa_approved',
      action: 'qa_approve',
      actorId: 'admin-1',
      actorType: 'admin',
    });

    const listed = await listSeedLifecycleTransitions({ seedId: 'db-seed-1' });
    expect(listed).toHaveLength(1);
    expect(listed[0].lifecycleStage).toBe('qa_approved');
  });
});

describe('governed non-store actions', () => {
  it('QA and claim actions never include store activation', () => {
    expect(GOVERNED_NON_STORE_ACTIONS.has('qa_approve')).toBe(true);
    expect(GOVERNED_NON_STORE_ACTIONS.has('claim_verify')).toBe(true);
    expect(GOVERNED_NON_STORE_ACTIONS.has('activation_confirmed')).toBe(false);
  });
});
