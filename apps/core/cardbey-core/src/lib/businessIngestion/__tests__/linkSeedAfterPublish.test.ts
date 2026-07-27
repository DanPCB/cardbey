/**
 * linkSeedAfterPublish — seed ↔ store linkage after draft publish.
 */

import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { approveSeed } from '../QaPromotionService.js';
import {
  upsertSeedRecords,
  resetIngestionDataForTests,
  getSeedRecordById,
} from '../IngestionRepository.js';
import {
  linkSeedAfterPublish,
  parseDraftInputForSeedLink,
} from '../linkSeedAfterPublish.js';
import {
  buildPublicDiscoveryCard,
  listPublicDiscoveryCards,
} from '../DiscoveryCardService.js';
import { isClaimableSeed } from '../QaPromotionService.js';
import type { NormalizedBusinessRecord } from '../types.js';

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'publish-link-1',
    businessName: 'Brunetti Carlton',
    legalName: null,
    address: '380 Lygon St, Carlton, VIC, Australia',
    phone: '+61393471200',
    website: 'https://brunetti.example.com',
    category: 'cafe',
    categoryConfidence: 0.9,
    registrationNumber: null,
    email: 'info@brunetti.example.com',
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.9,
    sourceType: 'open_data_url',
    sourceReference: 'MELBOURNE_BATCH0_20260617',
    sourceRowId: '1',
    ingestedAt: now,
    ...overrides,
  };
}

describe('linkSeedAfterPublish', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'link-seed-publish-test',
      String(Date.now()),
    );
    await resetIngestionDataForTests();
  });

  it('parseDraftInputForSeedLink reads ingestionSeedId and batchId', () => {
    const parsed = parseDraftInputForSeedLink({
      ingestionSeedId: 'gen-store-1',
      batchId: 'MELBOURNE_BATCH0_20260617',
      generationRunId: 'mission-abc',
    });
    expect(parsed.seedId).toBe('gen-store-1');
    expect(parsed.batchId).toBe('MELBOURNE_BATCH0_20260617');
  });

  it('links published store to seed and removes claimable discovery card', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized({ id: 'gen-store-1' }),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
      batchId: 'MELBOURNE_BATCH0_20260617',
    });
    await upsertSeedRecords([seed]);
    await approveSeed('gen-store-1', 'admin-qa');

    const before = await getSeedRecordById('gen-store-1');
    expect(before).toBeTruthy();
    expect(isClaimableSeed(before!)).toBe(true);
    expect(buildPublicDiscoveryCard(before!)).toBeTruthy();

    const result = await linkSeedAfterPublish({
      draftInput: {
        ingestionSeedId: 'gen-store-1',
        batchId: 'MELBOURNE_BATCH0_20260617',
        source: 'business_activation',
      },
      draftId: 'draft-brunetti-1',
      storeId: 'store-brunetti-1',
      publisherUserId: 'user-publisher-1',
      storefrontUrl: '/s/brunetti-carlton',
      businessName: 'Brunetti Carlton',
    });

    expect(result.ok).toBe(true);
    expect(result.linked).toBe(true);

    const linked = await getSeedRecordById('gen-store-1');
    expect(linked?.storeId).toBe('store-brunetti-1');
    expect(linked?.draftId).toBe('draft-brunetti-1');
    expect(linked?.claimable).toBe(false);
    expect(linked?.verificationStatus).toBe('seeded_claimable');
    expect(linked?.verifiedAt).toBeFalsy();
    expect(isClaimableSeed(linked!)).toBe(false);
    expect(buildPublicDiscoveryCard(linked!)).toBeNull();

    const cards = await listPublicDiscoveryCards({ limit: 20 });
    expect(cards.some((c) => c.id === 'gen-store-1')).toBe(false);
  });

  it('activates verified_owner seed without faking verification timestamps', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized({ id: 'verified-seed-1' }),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    const verified = {
      ...seed,
      verificationStatus: 'verified_owner' as const,
      claimable: false,
      ownerUserId: 'owner-1',
      verifiedAt: '2026-06-10T10:00:00.000Z',
      claimStartedAt: '2026-06-10T09:00:00.000Z',
    };
    await upsertSeedRecords([verified]);

    const result = await linkSeedAfterPublish({
      draftInput: { ingestionSeedId: 'verified-seed-1' },
      draftId: 'draft-verified-1',
      storeId: 'store-verified-1',
      publisherUserId: 'owner-1',
    });

    expect(result.ok).toBe(true);
    const linked = await getSeedRecordById('verified-seed-1');
    expect(linked?.verificationStatus).toBe('active');
    expect(linked?.storeId).toBe('store-verified-1');
    expect(linked?.activatedAt).toBeTruthy();
    expect(linked?.operatingStartedAt).toBeTruthy();
    expect(linked?.verifiedAt).toBe('2026-06-10T10:00:00.000Z');
  });

  it('is idempotent when seed already linked to same store', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized({ id: 'linked-seed-1' }),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    await upsertSeedRecords([
      {
        ...seed,
        verificationStatus: 'seeded_claimable',
        claimable: false,
        storeId: 'store-existing',
        draftId: 'draft-existing',
      },
    ]);

    const result = await linkSeedAfterPublish({
      draftInput: { ingestionSeedId: 'linked-seed-1' },
      draftId: 'draft-existing',
      storeId: 'store-existing',
      publisherUserId: 'user-1',
    });

    expect(result.linked).toBe(false);
    expect(result.ok).toBe(true);
  });
});
