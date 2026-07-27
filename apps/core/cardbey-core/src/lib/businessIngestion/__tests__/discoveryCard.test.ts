/**
 * Public Discovery Card tests (marketplace layer).
 */

import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { approveSeed } from '../QaPromotionService.js';
import { upsertSeedRecords, resetIngestionDataForTests, getSeedRecordById } from '../IngestionRepository.js';
import {
  buildPublicDiscoveryCard,
  listPublicDiscoveryCards,
} from '../DiscoveryCardService.js';
import { translateSeedToPublicLifecycle } from '../publicLifecycle.js';
import type { NormalizedBusinessRecord } from '../types.js';

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'disc-card-1',
    businessName: 'Harbour Cafe',
    legalName: null,
    address: '10 Collins St, Melbourne, VIC, Australia',
    phone: '+61400111222',
    website: 'https://harbour.example.com',
    category: 'cafe',
    categoryConfidence: 0.85,
    registrationNumber: null,
    email: 'info@harbour.example.com',
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

describe('Public Discovery Cards', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'discovery-card-test',
      String(Date.now()),
    );
    await resetIngestionDataForTests();
  });

  it('translates seeded_claimable to discovered_business lifecycle', () => {
    expect(translateSeedToPublicLifecycle('seeded_claimable')).toBe('discovered_business');
    expect(translateSeedToPublicLifecycle('verified_owner')).toBe('verified_owner');
    expect(translateSeedToPublicLifecycle('active')).toBe('business_space');
    expect(translateSeedToPublicLifecycle('seeded_pending_qa')).toBeNull();
  });

  it('builds discovery card without internal ingestion fields', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized({ id: 'card-1' }),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 88,
      qualityTier: 'high_quality',
    });
    await upsertSeedRecords([seed]);
    await approveSeed('card-1', 'admin-qa');
    const approved = await getSeedRecordById('card-1');
    expect(approved).toBeTruthy();

    const card = buildPublicDiscoveryCard(approved!);
    expect(card).toBeTruthy();
    expect(card?.businessName).toBe('Harbour Cafe');
    expect(card?.badge).toBe('Discovered by Cardbey');
    expect(card?.claimUrl).toBe('/activate-business/card-1');
    expect(card?.profileUrl).toMatch(/^\/business\//);
    expect(card?.slug).toBeTruthy();
    expect(card?.heroImageUrl).toMatch(/^https:\/\//);
    expect(card?.locationLabel).toContain('Melbourne');
    expect(card?.publicLifecycle).toBe('discovered_business');
    expect(JSON.stringify(card)).not.toContain('seeded_claimable');
    expect(JSON.stringify(card)).not.toContain('sourceType');
    expect(JSON.stringify(card)).not.toContain('confidenceScore');
  });

  it('listPublicDiscoveryCards returns only claimable businesses', async () => {
    const claimable = buildIngestedSeedRecord({
      normalized: makeNormalized({ id: 'list-1', businessName: 'Alpha Cafe' }),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    const pending = buildIngestedSeedRecord({
      normalized: makeNormalized({ id: 'list-2', businessName: 'Pending Shop' }),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 90,
      qualityTier: 'high_quality',
    });
    await upsertSeedRecords([claimable, pending]);
    await approveSeed('list-1', 'admin-qa');

    const cards = await listPublicDiscoveryCards({ limit: 10 });
    expect(cards.length).toBe(1);
    expect(cards[0].businessName).toBe('Alpha Cafe');
  });
});
