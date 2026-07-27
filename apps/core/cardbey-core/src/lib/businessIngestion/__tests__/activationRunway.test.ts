/**
 * Business Activation Runway V2 tests — preview safety + runtime gates.
 */

import path from 'node:path';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { approveSeed } from '../QaPromotionService.js';
import { upsertSeedRecords, resetIngestionDataForTests, getSeedRecordById } from '../IngestionRepository.js';
import {
  buildPublicActivationPreview,
  executeActivateBusinessSpaceRunway,
  getPublicActivationPreviewBySeedId,
} from '../ActivationRunwayService.js';
import type { IngestedSeedRecord, NormalizedBusinessRecord } from '../types.js';

const findLiveDuplicateMock = vi.fn();
const transferMock = vi.fn();

vi.mock('../LiveDuplicateCheck.js', () => ({
  findLiveBusinessDuplicate: (...args: unknown[]) => findLiveDuplicateMock(...args),
}));

vi.mock('../../missionPipelineService.js', () => ({
  createMissionPipeline: vi.fn(async () => ({ id: 'mission-runway-1' })),
}));

vi.mock('../../../services/suitcase/suitcaseItemService.js', () => ({
  createSuitcaseItem: vi.fn(async () => ({ item: { id: 'suitcase-1' } })),
}));

vi.mock('../SeedOwnershipTransfer.js', () => ({
  transferSeedStoreToOwner: (...args: unknown[]) => transferMock(...args),
  ensureSeedStoreExists: vi.fn(async () => ({ storeId: 'store-runway-1' })),
}));

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'runway-1',
    businessName: 'Runway Roasters',
    legalName: null,
    address: '22 Queen St, Melbourne, VIC, Australia',
    phone: '+61400111222',
    website: 'https://runway.example.com',
    category: 'cafe',
    categoryConfidence: 0.85,
    registrationNumber: null,
    email: 'hello@runway.example.com',
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.82,
    sourceType: 'open_data_url',
    sourceReference: 'fixture',
    sourceRowId: '1',
    ingestedAt: now,
    ...overrides,
  };
}

async function seedClaimable(id = 'runway-1'): Promise<IngestedSeedRecord> {
  const seed = buildIngestedSeedRecord({
    normalized: makeNormalized({ id }),
    resolution: 'unique',
    matchEvidence: [],
    qualityScore: 88,
    qualityTier: 'high_quality',
  });
  await upsertSeedRecords([seed]);
  await approveSeed(id, 'admin-qa');
  const approved = await getSeedRecordById(id);
  if (!approved) throw new Error('approve failed');
  return approved;
}

describe('Business Activation Runway V2', () => {
  beforeEach(async () => {
    findLiveDuplicateMock.mockResolvedValue({
      blocked: false,
      matchedBusinessId: null,
      evidence: [],
    });
    transferMock.mockResolvedValue({ ok: true, storeId: 'store-runway-1', draftId: 'draft-1' });

    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'activation-runway-test',
      `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await resetIngestionDataForTests();
  });

  it('buildPublicActivationPreview exposes safe public fields only', async () => {
    const seed = await seedClaimable('preview-1');
    const preview = buildPublicActivationPreview(seed);
    expect(preview).toBeTruthy();
    expect(preview?.businessName).toBe('Runway Roasters');
    expect(preview?.badge).toBe('Discovered by Cardbey');
    expect(preview?.runwayStage).toBe('discovered');
    expect(preview?.runwayStageLabel).toBe('Discovered');
    expect(preview?.canVerify).toBe(true);
    expect(preview?.canActivate).toBe(false);
    expect(JSON.stringify(preview)).not.toMatch(/seed|ingestion|crawler|sourceType|confidence/i);
  });

  it('getPublicActivationPreviewBySeedId includes business snapshot after QA approval', async () => {
    await seedClaimable('preview-bi-1');
    const res = await getPublicActivationPreviewBySeedId('preview-bi-1');
    expect(res.ok).toBe(true);
    expect(res.preview?.businessSnapshot?.visibilityScore).toBeGreaterThan(0);
    expect(res.preview?.businessSnapshot?.recommendedActions?.length).toBeGreaterThan(0);
    expect(res.preview?.businessSnapshot?.campaignMessage).toMatch(/Business Snapshot/);
  });

  it('getPublicActivationPreviewBySeedId resolves preview by id', async () => {
    await seedClaimable('preview-2');
    const res = await getPublicActivationPreviewBySeedId('preview-2');
    expect(res.ok).toBe(true);
    expect(res.preview?.profileSlug).toMatch(/^runway-roasters-melbourne-/);
  });

  it('executeActivateBusinessSpaceRunway blocks without owner confirmation', async () => {
    await seedClaimable('gate-1');
    const blocked = await executeActivateBusinessSpaceRunway({
      seedId: 'gate-1',
      userId: 'user-1',
      confirmed: false,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.status).toBe('blocked');
    expect(blocked.error?.code).toBe('confirmation_required');
  });

  it('executeActivateBusinessSpaceRunway blocks before ownership verification', async () => {
    await seedClaimable('gate-2');
    const blocked = await executeActivateBusinessSpaceRunway({
      seedId: 'gate-2',
      userId: 'user-1',
      confirmed: true,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.status).toBe('blocked');
    expect(blocked.error?.code).toBe('activation_not_allowed');
  });

  it('executeActivateBusinessSpaceRunway completes for verified owner via runtime path', async () => {
    const seed = await seedClaimable('activate-1');
    await upsertSeedRecords([
      {
        ...seed,
        verificationStatus: 'verified_owner',
        ownerUserId: 'owner-1',
      },
    ]);

    const result = await executeActivateBusinessSpaceRunway({
      seedId: 'activate-1',
      userId: 'owner-1',
      confirmed: true,
    });

    expect(result.ok).toBe(true);
    expect(result.status).toBe('completed');
    expect(result.output?.performerId).toBeTruthy();
    expect(result.output?.activationMissionId).toBe('mission-runway-1');
    expect(result.output?.businessSpaceId).toBe('store-runway-1');
    expect(result.output?.profileSlug).toMatch(/^runway-roasters-melbourne-/);

    const activated = await getSeedRecordById('activate-1');
    expect(activated?.activatedAt).toBeTruthy();
    expect(activated?.activationDurationMs).toBeGreaterThanOrEqual(0);
  });
});
