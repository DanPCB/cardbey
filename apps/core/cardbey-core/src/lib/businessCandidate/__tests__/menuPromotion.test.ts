import { describe, expect, it, vi, beforeEach } from 'vitest';
import { buildIngestedSeedRecord } from '../../businessIngestion/SeedGovernance.js';
import type { NormalizedBusinessRecord } from '../../businessIngestion/types.js';
import type { BusinessCandidateRecord } from '../types.js';
import type { FetchedMenuRecord } from '../enrichment/types/menuTypes.js';
import {
  resolveFetchedMenuForSeed,
  writeFetchedMenuToStore,
  promoteSeedMenuToStore,
} from '../menuPromotion.js';

const mockProductCreate = vi.fn();
const mockProductFindMany = vi.fn();

vi.mock('../../prisma.js', () => ({
  getPrismaClient: () => ({
    product: {
      create: mockProductCreate,
      findMany: mockProductFindMany,
    },
  }),
}));

vi.mock('../media/findBusinessCandidateForSeed.js', () => ({
  findBusinessCandidateForSeed: vi.fn(),
}));

vi.mock('../candidateRepository.js', () => ({
  saveBusinessCandidate: vi.fn(),
}));

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'seed-menu-1',
    businessName: 'Test Cafe',
    legalName: null,
    address: '1 Test St, Melbourne, VIC, Australia',
    phone: '+61390000000',
    website: 'https://test.example.com',
    category: 'cafe',
    categoryConfidence: 0.9,
    registrationNumber: null,
    email: null,
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.9,
    sourceType: 'open_data_url',
    sourceReference: 'TEST_BATCH',
    sourceRowId: '1',
    ingestedAt: now,
    ...overrides,
  };
}

function makeMenu(overrides: Partial<FetchedMenuRecord> = {}): FetchedMenuRecord {
  return {
    items: [
      {
        name: 'Flat White',
        description: 'House espresso with steamed milk',
        price: 5.5,
        priceDisplay: '$5.50',
        category: 'Coffee',
        dietaryTags: [],
        imageUrl: null,
        isSignatureDish: true,
        sourceConfidence: 0.85,
        extractionSource: 'website_menu_page',
      },
      {
        name: 'Synthesised Item',
        description: 'Low confidence synthesis',
        price: null,
        priceDisplay: null,
        category: 'Menu',
        dietaryTags: [],
        imageUrl: null,
        isSignatureDish: false,
        sourceConfidence: 0.4,
        extractionSource: 'claude_synthesis',
      },
    ],
    sections: ['Coffee'],
    currency: 'AUD',
    extractedAt: new Date().toISOString(),
    source: 'website',
    confidence: 'medium',
    rawText: null,
    ...overrides,
  };
}

describe('menuPromotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProductFindMany.mockResolvedValue([]);
    mockProductCreate.mockResolvedValue({ id: 'product-1' });
  });

  describe('resolveFetchedMenuForSeed', () => {
    it('prefers candidate.fetchedMenu over seed enrichmentProfile', () => {
      const seed = buildIngestedSeedRecord({
        normalized: makeNormalized(),
        resolution: 'unique',
        matchEvidence: [],
        qualityScore: 90,
        qualityTier: 'high_quality',
      });
      const candidateMenu = makeMenu({ source: 'candidate' });
      const seedMenu = makeMenu({ source: 'seed' });
      const candidate = {
        fetchedMenu: candidateMenu,
      } as BusinessCandidateRecord;

      const resolved = resolveFetchedMenuForSeed(
        {
          ...seed,
          enrichmentProfile: { fetchedMenu: seedMenu },
        },
        candidate,
      );

      expect(resolved?.source).toBe('candidate');
    });

    it('falls back to seed.enrichmentProfile.fetchedMenu when candidate has no menu', () => {
      const seed = buildIngestedSeedRecord({
        normalized: makeNormalized(),
        resolution: 'unique',
        matchEvidence: [],
        qualityScore: 90,
        qualityTier: 'high_quality',
      });
      const seedMenu = makeMenu({ source: 'seed' });

      const resolved = resolveFetchedMenuForSeed(
        {
          ...seed,
          enrichmentProfile: { fetchedMenu: seedMenu },
        },
        null,
      );

      expect(resolved?.source).toBe('seed');
    });
  });

  describe('writeFetchedMenuToStore', () => {
    it('writes only items at or above confidence threshold', async () => {
      const written = await writeFetchedMenuToStore('store-1', makeMenu(), 'Test Cafe');

      expect(written).toBe(1);
      expect(mockProductCreate).toHaveBeenCalledTimes(1);
      expect(mockProductCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: 'store-1',
            name: 'Flat White',
            serviceCatalog: expect.objectContaining({
              extractionSource: 'website_menu_page',
              ownerConfirmed: false,
            }),
          }),
        }),
      );
    });
  });

  describe('promoteSeedMenuToStore', () => {
    it('skips when store already has promoted menu products', async () => {
      mockProductFindMany.mockResolvedValue([
        { serviceCatalog: { extractionSource: 'website_menu_page' } },
      ]);

      const seed = buildIngestedSeedRecord({
        normalized: makeNormalized(),
        resolution: 'unique',
        matchEvidence: [],
        qualityScore: 90,
        qualityTier: 'high_quality',
      });

      const written = await promoteSeedMenuToStore('store-1', seed);

      expect(written).toBe(0);
      expect(mockProductCreate).not.toHaveBeenCalled();
    });

    it('promotes menu from seed enrichmentProfile when candidate is missing', async () => {
      const { findBusinessCandidateForSeed } = await import('../media/findBusinessCandidateForSeed.js');
      vi.mocked(findBusinessCandidateForSeed).mockResolvedValue(null);

      const seed = buildIngestedSeedRecord({
        normalized: makeNormalized(),
        resolution: 'unique',
        matchEvidence: [],
        qualityScore: 90,
        qualityTier: 'high_quality',
      });

      const written = await promoteSeedMenuToStore('store-1', {
        ...seed,
        enrichmentProfile: { fetchedMenu: makeMenu() },
      });

      expect(written).toBe(1);
      expect(mockProductCreate).toHaveBeenCalledTimes(1);
    });
  });
});
