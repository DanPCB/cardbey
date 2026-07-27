import { describe, expect, it, beforeEach, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  resetBusinessCandidatesForTests,
  saveBusinessCandidate,
  getBusinessCandidateById,
  listBusinessCandidatesByBatch,
} from '../candidateRepository.js';
import { resetIngestionDataForTests, upsertSeedRecords } from '../../businessIngestion/IngestionRepository.js';
import { resetBriefsForTests, saveBrief } from '../brief/briefRepository.js';
import { resetClaimIntentsForTests, saveClaimIntent } from '../claimIntent/claimIntentRepository.js';
import { resetMediaEvidenceForTests, upsertMediaAssets } from '../media/mediaEvidenceRepository.js';
import { resetRollbackDataForTests, listRollbackAuditForJob } from '../rollback/rollbackRepository.js';
import {
  runBatchRollbackDryRun,
  runBatchRollbackExecute,
  runBusinessRollbackDryRun,
  runBusinessRollbackExecute,
} from '../rollback/rollbackService.js';
import { buildBatchOnboardingMetrics } from '../buildBatchMetrics.js';
import { buildPublicDiscoveryCard } from '../../businessIngestion/DiscoveryCardService.js';
import { buildPublicBusinessProfile } from '../../businessIngestion/PublicBusinessProfileService.js';
import { MELBOURNE_BATCH0_ID } from '../batch001Config.js';
import type { BusinessCandidateRecord } from '../types.js';
import type { IngestedSeedRecord } from '../../businessIngestion/types.js';

const ADMIN = { id: 'admin-1', role: 'platform_admin' };
const BATCH = 'MELBOURNE_BATCH001_REAL_LOCAL';

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    business: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        where.id === 'published-store-1'
          ? { publishedAt: new Date(), isActive: true, slug: 'live-store' }
          : null,
      ),
      findMany: vi.fn(async () => []),
    },
  }),
}));

function sampleCandidate(overrides: Partial<BusinessCandidateRecord> = {}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    batchId: BATCH,
    campaignId: 'camp-1',
    name: 'Test Bakery',
    businessType: 'bakery',
    address: '1 St',
    suburb: 'Footscray',
    city: 'Footscray',
    state: 'VIC',
    postcode: '3011',
    country: 'AU',
    phone: null,
    website: null,
    email: null,
    socialLinks: [],
    coordinates: null,
    discoveredFrom: 'google',
    confidenceScore: 0.9,
    originalContent: {},
    fetchedImages: [],
    fetchedMenu: null,
    fetchedServices: [],
    missingFields: [],
    ownerMatched: false,
    ownerId: null,
    storeDraftId: null,
    storeId: null,
    missionId: null,
    placeId: 'place-1',
    sourceUrl: null,
    rawSourceJson: null,
    seedId: null,
    status: 'PENDING_QA',
    dedupeKey: `dedupe-${randomUUID()}`,
    discoveryProviderId: 'google_places',
    externalId: 'ext-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function sampleSeed(overrides: Partial<IngestedSeedRecord> = {}): IngestedSeedRecord {
  const now = new Date().toISOString();
  const id = randomUUID();
  return {
    id,
    normalized: {
      businessName: 'Test Bakery',
      category: 'bakery',
      city: 'Footscray',
      state: 'VIC',
      country: 'AU',
      sourceType: 'places_discovery',
      sourceReference: BATCH,
    },
    resolution: 'new',
    matchEvidence: [],
    qualityScore: 0.8,
    qualityTier: 'B',
    verificationStatus: 'seeded_claimable',
    claimable: true,
    publicVisibility: 'limited',
    ownerUserId: null,
    storeId: null,
    draftId: null,
    batchId: BATCH,
    campaignId: 'camp-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('discovery rollback', () => {
  beforeEach(async () => {
    await resetBusinessCandidatesForTests();
    await resetIngestionDataForTests();
    await resetBriefsForTests();
    await resetClaimIntentsForTests();
    await resetMediaEvidenceForTests();
    await resetRollbackDataForTests();
  });

  it('rejects Batch 0 rollback', async () => {
    const result = await runBatchRollbackDryRun(
      { batchId: MELBOURNE_BATCH0_ID, reason: 'test' },
      ADMIN,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/Batch 0/i);
  });

  it('dry run does not mutate records', async () => {
    const c = sampleCandidate();
    await saveBusinessCandidate(c);
    const before = await getBusinessCandidateById(c.id);
    const dry = await runBatchRollbackDryRun({ batchId: BATCH, reason: 'qa mistake' }, ADMIN);
    expect(dry.ok).toBe(true);
    const after = await getBusinessCandidateById(c.id);
    expect(after?.status).toBe(before?.status);
  });

  it('batch rollback hides candidates and seeds', async () => {
    const seed = sampleSeed();
    const c = sampleCandidate({ seedId: seed.id, status: 'CLAIMABLE' });
    await saveBusinessCandidate(c);
    await upsertSeedRecords([seed]);

    const dry = await runBatchRollbackDryRun({ batchId: BATCH, reason: 'bad batch' }, ADMIN);
    expect(dry.ok).toBe(true);
    if (!dry.ok) return;

    const batchExec = await runBatchRollbackExecute({ dryRunJobId: dry.preview.job.id }, ADMIN);
    expect(batchExec.ok).toBe(true);

    const updated = await getBusinessCandidateById(c.id);
    expect(updated?.status).toBe('ROLLED_BACK');
    expect(updated?.operatorVisibility).toBe('hidden');
  });

  it('single business rollback only affects selected business', async () => {
    const c1 = sampleCandidate({ name: 'A' });
    const c2 = sampleCandidate({ name: 'B', dedupeKey: 'dedupe-b' });
    await saveBusinessCandidate(c1);
    await saveBusinessCandidate(c2);

    const dry = await runBusinessRollbackDryRun(
      { candidateId: c1.id, reason: 'wrong business' },
      ADMIN,
    );
    expect(dry.ok).toBe(true);
    if (!dry.ok) return;

    await runBusinessRollbackExecute({ dryRunJobId: dry.preview.job.id }, ADMIN);

    expect((await getBusinessCandidateById(c1.id))?.status).toBe('ROLLED_BACK');
    expect((await getBusinessCandidateById(c2.id))?.status).toBe('PENDING_QA');
  });

  it('marks ClaimIntent as abandoned_rollback', async () => {
    const c = sampleCandidate();
    await saveBusinessCandidate(c);
    const intent = {
      id: randomUUID(),
      candidateId: c.id,
      seedId: null,
      userId: null,
      email: null,
      source: 'CLAIM_BUTTON' as const,
      status: 'started' as const,
      sessionId: 'sess-1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await saveClaimIntent(intent);

    const dry = await runBusinessRollbackDryRun({ candidateId: c.id, reason: 'cleanup' }, ADMIN);
    expect(dry.ok).toBe(true);
    if (!dry.ok) return;
    const exec = await runBusinessRollbackExecute({ dryRunJobId: dry.preview.job.id }, ADMIN);
    expect(exec.ok).toBe(true);

    const { listClaimIntents } = await import('../claimIntent/claimIntentRepository.js');
    const updated = (await listClaimIntents()).find((i) => i.id === intent.id);
    expect(updated?.status).toBe('abandoned_rollback');
  });

  it('blocks rollback when published store linked by default', async () => {
    const c = sampleCandidate({ storeId: 'published-store-1', status: 'CLAIMABLE' });
    await saveBusinessCandidate(c);
    const dry = await runBusinessRollbackDryRun({ candidateId: c.id, reason: 'test' }, ADMIN);
    expect(dry.ok).toBe(true);
    if (!dry.ok) return;
    expect(dry.preview.blockedReasons.length).toBeGreaterThan(0);
    expect(dry.preview.safetyLevel).not.toBe('SAFE');
  });

  it('blocks verified claim rollback without force', async () => {
    const c = sampleCandidate({ status: 'VERIFIED', ownerId: 'owner-1' });
    await saveBusinessCandidate(c);
    const dry = await runBusinessRollbackDryRun({ candidateId: c.id, reason: 'test' }, ADMIN);
    expect(dry.ok).toBe(true);
    if (!dry.ok) return;
    expect(dry.preview.requiredPermissions).toContain('control_center.rollback.force');
  });

  it('requires elevated permission for force rollback execute', async () => {
    const c = sampleCandidate({ status: 'VERIFIED' });
    await saveBusinessCandidate(c);
    const dry = await runBusinessRollbackDryRun(
      { candidateId: c.id, reason: 'test', force: true },
      { id: 'staff-1', role: 'staff', permissions: ['control_center.rollback.discovery'] },
    );
    expect(dry.ok).toBe(true);
    if (!dry.ok) return;
    const exec = await runBusinessRollbackExecute({ dryRunJobId: dry.preview.job.id }, {
      id: 'staff-1',
      role: 'staff',
      permissions: ['control_center.rollback.discovery'],
    });
    expect(exec.ok).toBe(false);
  });

  it('does not delete owner-uploaded media', async () => {
    const c = sampleCandidate();
    await saveBusinessCandidate(c);
    const asset = {
      id: randomUUID(),
      candidateId: c.id,
      seedId: null,
      assetType: 'hero' as const,
      url: 'https://owner.example/photo.jpg',
      thumbnailUrl: null,
      sourceProvider: null,
      sourceUrl: null,
      sourceLabel: null,
      sourceType: 'owner_uploaded' as const,
      matchConfidence: 1,
      categoryMatchConfidence: 1,
      businessSpecificConfidence: 1,
      isRepresentative: false,
      licenseStatus: 'owner' as const,
      usageStatus: 'approved' as const,
      evidenceJson: {},
      createdAt: new Date().toISOString(),
    };
    await upsertMediaAssets([asset]);

    const dry = await runBusinessRollbackDryRun({ candidateId: c.id, reason: 'test' }, ADMIN);
    expect(dry.ok).toBe(true);
    if (!dry.ok) return;
    await runBusinessRollbackExecute({ dryRunJobId: dry.preview.job.id }, ADMIN);

    const { listMediaForCandidate } = await import('../media/mediaEvidenceRepository.js');
    const after = (await listMediaForCandidate(c.id)).find((a) => a.id === asset.id);
    expect(after?.usageStatus).toBe('approved');
  });

  it('hides public claim page after rollback', async () => {
    const seed = sampleSeed();
    await upsertSeedRecords([seed]);
    expect(await buildPublicDiscoveryCard(seed)).not.toBeNull();
    expect(await buildPublicBusinessProfile(seed)).not.toBeNull();

    const dry = await runBusinessRollbackDryRun({ seedId: seed.id, reason: 'hide' }, ADMIN);
    if (!dry.ok) throw new Error('dry failed');
    await runBusinessRollbackExecute({ dryRunJobId: dry.preview.job.id }, ADMIN);

    const { getSeedRecordById } = await import('../../businessIngestion/IngestionRepository.js');
    const rolled = await getSeedRecordById(seed.id);
    expect(rolled?.verificationStatus).toBe('rolled_back');
    expect(await buildPublicDiscoveryCard(rolled!)).toBeNull();
    expect(await buildPublicBusinessProfile(rolled!)).toBeNull();
  });

  it('updates batch metrics after rollback', async () => {
    const c = sampleCandidate({ status: 'CLAIMABLE' });
    await saveBusinessCandidate(c);
    const dry = await runBusinessRollbackDryRun({ candidateId: c.id, reason: 'metrics' }, ADMIN);
    if (!dry.ok) throw new Error('dry failed');
    await runBusinessRollbackExecute({ dryRunJobId: dry.preview.job.id }, ADMIN);

    const metrics = await buildBatchOnboardingMetrics(BATCH);
    expect(metrics.rolledBackCandidates).toBeGreaterThanOrEqual(1);
    expect(metrics.activeAfterRollback).toBeLessThan(metrics.discovered);
  });

  it('creates audit events for mutations', async () => {
    const c = sampleCandidate();
    await saveBusinessCandidate(c);
    const dry = await runBusinessRollbackDryRun({ candidateId: c.id, reason: 'audit' }, ADMIN);
    if (!dry.ok) throw new Error('dry failed');
    const exec = await runBusinessRollbackExecute({ dryRunJobId: dry.preview.job.id }, ADMIN);
    if (!exec.ok) throw new Error('exec failed');
    const audit = await listRollbackAuditForJob(exec.job.id);
    expect(audit.length).toBeGreaterThan(0);
    expect(audit.some((e) => e.entityType === 'BusinessCandidate')).toBe(true);
  });
});
