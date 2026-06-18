/**
 * Generate full store from seed — runtime tests.
 */

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { upsertSeedRecords, resetIngestionDataForTests } from '../IngestionRepository.js';
import { approveSeed } from '../QaPromotionService.js';
import type { IngestedSeedRecord, NormalizedBusinessRecord } from '../types.js';

const createMissionPipelineMock = vi.fn(async () => ({ id: 'mission-gen-1' }));
const createDraftStoreForUserMock = vi.fn(async () => ({ id: 'draft-gen-1', status: 'draft' }));
const createDraftMock = vi.fn(async () => ({ id: 'draft-guest-1', status: 'draft' }));
const generateDraftMock = vi.fn(async () => undefined);
const getDraftMock = vi.fn(async (id: string) => ({
  id,
  status: 'ready',
  preview: {
    storeName: 'Brunetti Carlton',
    storeType: 'cafe',
    heroImageUrl: 'https://example.com/hero.jpg',
    tagline: 'Italian cafe',
    phone: '+61393495200',
    categories: [{ id: '1', name: 'Pastries' }],
    items: [{ id: 'o1', name: 'Welcome offer' }],
    website: {
      sections: [
        { type: 'hero', content: { headline: 'Brunetti Carlton' } },
        { type: 'about', content: { body: 'Since 1985' } },
        { type: 'contact', content: { phone: '+61393495200' } },
      ],
    },
  },
}));
const prismaUpdateMock = vi.fn(async () => ({}));

vi.mock('../../missionPipelineService.js', () => ({
  createMissionPipeline: (...args: unknown[]) => createMissionPipelineMock(...args),
}));

vi.mock('../../../services/draftStore/draftStoreService.js', () => ({
  createDraftStoreForUser: (...args: unknown[]) => createDraftStoreForUserMock(...args),
  createDraft: (...args: unknown[]) => createDraftMock(...args),
  generateDraft: (...args: unknown[]) => generateDraftMock(...args),
  getDraft: (...args: unknown[]) => getDraftMock(...args),
}));

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    draftStore: {
      update: (...args: unknown[]) => prismaUpdateMock(...args),
    },
  }),
}));

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'gen-store-1',
    businessName: 'Brunetti Carlton',
    legalName: null,
    address: '380 Lygon St, Carlton, VIC',
    phone: '+61393495200',
    website: 'https://brunetti.com.au',
    category: 'cafe',
    categoryConfidence: 0.9,
    registrationNumber: null,
    email: 'carlton@brunetti.com.au',
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.9,
    sourceType: 'csv',
    sourceReference: 'MELBOURNE_BATCH0_20260617',
    sourceRowId: '1',
    ingestedAt: now,
    ...overrides,
  };
}

function makeSeed(overrides: Partial<IngestedSeedRecord> = {}): IngestedSeedRecord {
  const normalized = makeNormalized(
    overrides.normalized as Partial<NormalizedBusinessRecord> | undefined,
  );
  return buildIngestedSeedRecord({
    id: overrides.id ?? normalized.id,
    normalized,
    verificationStatus: overrides.verificationStatus ?? 'seeded_claimable',
    batchId: overrides.batchId ?? 'MELBOURNE_BATCH0_20260617',
    ...overrides,
  });
}

describe('generateFullStoreFromSeedService', () => {
  beforeEach(async () => {
    await resetIngestionDataForTests();
    createMissionPipelineMock.mockClear();
    createDraftStoreForUserMock.mockClear();
    createDraftMock.mockClear();
    generateDraftMock.mockClear();
    getDraftMock.mockClear();
    prismaUpdateMock.mockClear();
  });

  it('returns not_found for missing seed', async () => {
    const { executeGenerateFullStoreFromSeedRunway } = await import(
      '../generateFullStoreFromSeedService.js'
    );
    const result = await executeGenerateFullStoreFromSeedRunway({
      seedId: 'missing-seed',
      userId: 'user-1',
    });
    expect(result.ok).toBe(false);
    expect(result.error?.code).toBe('not_found');
  });

  it('requires auth before mission or draft creation', async () => {
    const seed = makeSeed({ id: 'gen-seed-auth' });
    await upsertSeedRecords([seed]);

    const { executeGenerateFullStoreFromSeedRunway } = await import(
      '../generateFullStoreFromSeedService.js'
    );
    const result = await executeGenerateFullStoreFromSeedRunway({
      seedId: seed.id,
      userId: null,
    });
    expect(result.ok).toBe(false);
    expect(result.failureStage).toBe('auth_required');
    expect(createMissionPipelineMock).not.toHaveBeenCalled();
    expect(createDraftStoreForUserMock).not.toHaveBeenCalled();
  });

  it('creates governed mission and draft without publish', async () => {
    const seed = makeSeed({ id: 'gen-seed-1' });
    await upsertSeedRecords([seed]);
    await approveSeed(seed.id, { actorId: 'qa-1' });

    const { executeGenerateFullStoreFromSeedRunway } = await import(
      '../generateFullStoreFromSeedService.js'
    );
    const result = await executeGenerateFullStoreFromSeedRunway({
      seedId: seed.id,
      userId: 'owner-1',
      source: 'activation_page',
    });

    expect(result.ok).toBe(true);
    expect(result.output?.missionId).toBe('mission-gen-1');
    expect(result.output?.draftStoreId).toBe('draft-gen-1');
    expect(result.output?.nextRoute).toContain('/app/store/draft/review');
    expect(result.output?.completenessScore).toBeGreaterThanOrEqual(50);
    expect(createMissionPipelineMock).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'store',
        requiresConfirmation: false,
        metadata: expect.objectContaining({ seedId: seed.id }),
      }),
    );
    expect(createDraftStoreForUserMock).toHaveBeenCalled();
    expect(generateDraftMock).toHaveBeenCalledWith(
      'draft-gen-1',
      expect.objectContaining({ userId: 'owner-1', reactMissionId: 'mission-gen-1' }),
    );
  });

  it('writes suitcase handoff metadata', async () => {
    const seed = makeSeed({ id: 'gen-seed-2' });
    await upsertSeedRecords([seed]);
    await approveSeed(seed.id, { actorId: 'qa-1' });

    const { executeGenerateFullStoreFromSeedRunway } = await import(
      '../generateFullStoreFromSeedService.js'
    );
    await executeGenerateFullStoreFromSeedRunway({
      seedId: seed.id,
      userId: 'owner-1',
    });

    const { getSeedSuitcase } = await import('../seedSuitcaseStore.js');
    const suitcase = await getSeedSuitcase(seed.id);
    expect(suitcase?.performerHandoffs?.some((h) => h.type === 'performer_store_generation_started')).toBe(
      true,
    );
    expect(suitcase?.performerHandoffs?.some((h) => h.type === 'performer_store_draft_created')).toBe(true);
  });
});

describe('executeGenerateFullStoreFromSeedCapability registration', () => {
  it('ui runtime service registers generate_full_store_from_seed', () => {
    const file = readFileSync(
      path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        'runtime',
        'performerRuntime',
        'uiRuntimeActionService.js',
      ),
      'utf8',
    );
    expect(file).toContain("case 'generate_full_store_from_seed'");
    expect(file).toContain('handleGenerateFullStoreFromSeed');
  });
});
