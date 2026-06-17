import path from 'node:path';
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { generateAndStoreBiSnapshotForSeed, migrateSeedSuitcaseToBusinessSpace } from '../seedSuitcaseService.js';
import { buildBusinessEvolutionSnapshot } from '../businessEvolutionService.js';
import { resetIngestionDataForTests } from '../IngestionRepository.js';
import type { NormalizedBusinessRecord } from '../types.js';

const prismaMock = {
  business: {
    findUnique: vi.fn(),
  },
  product: { count: vi.fn(async () => 2) },
  screen: { count: vi.fn(async () => 1) },
  promotion: { findMany: vi.fn(async () => [{ id: 'p1', status: 'active' }]) },
  campaignV2: { findMany: vi.fn(async () => [{ id: 'c1', status: 'RUNNING' }]) },
  loyaltyProgram: { findMany: vi.fn(async () => [{ id: 'l1' }]) },
  smartDocument: { count: vi.fn(async () => 1) },
};

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => prismaMock,
}));

vi.mock('../../../services/draftStore/draftStoreService.js', () => ({
  getDraft: vi.fn(async () => ({
    draft: { preview: { description: 'Updated description', heroImageUrl: 'https://x/hero.jpg' } },
  })),
}));

function makeNormalized(): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: 'evo-seed-1',
    businessName: 'Evolution Cafe',
    legalName: null,
    address: '1 Main St',
    phone: '+61400111222',
    website: 'https://evo.example.com',
    category: 'cafe',
    categoryConfidence: 0.8,
    registrationNumber: null,
    email: null,
    operatingRegion: 'AU',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.75,
    sourceType: 'open_data_url',
    sourceReference: 'fixture',
    sourceRowId: '1',
    ingestedAt: now,
  };
}

describe('businessEvolutionService', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'evolution-test',
      String(Date.now()),
    );
    await resetIngestionDataForTests();
    prismaMock.business.findUnique.mockResolvedValue({
      id: 'store-evo-1',
      userId: 'owner-1',
      name: 'Evolution Cafe',
      description: 'Updated description',
      phone: '+61400111222',
      address: '1 Main St',
      website: 'https://evo.example.com',
      type: 'cafe',
      heroImageUrl: 'https://x/hero.jpg',
      socialLinks: { instagram: 'https://instagram.com/evo' },
    });
  });

  it('builds before/after evolution from migrated BI baseline', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized(),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    await generateAndStoreBiSnapshotForSeed(seed);
    await migrateSeedSuitcaseToBusinessSpace({ seedId: seed.id, storeId: 'store-evo-1' });

    const evolution = await buildBusinessEvolutionSnapshot('store-evo-1');
    expect(evolution?.hasBaseline).toBe(true);
    expect(evolution?.baseline.visibilityScore).toBeGreaterThan(0);
    expect(evolution?.current.engagementReadinessScore).toBeGreaterThan(
      evolution?.baseline.engagementReadinessScore ?? 0,
    );
    expect(evolution?.deltas.distributionCoverage).toBeGreaterThan(0);
    expect(evolution?.timeline.some((e) => e.id === 'first-offer' && e.completed)).toBe(true);
    expect(evolution?.recommendedNextActions.length).toBeGreaterThan(0);
  });
});
