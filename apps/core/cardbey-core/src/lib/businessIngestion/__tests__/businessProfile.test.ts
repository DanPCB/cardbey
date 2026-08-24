/**
 * Public business profile by slug tests.
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
import { buildPublicDiscoveryCard } from '../DiscoveryCardService.js';
import { buildPublicBusinessSlug } from '../businessPublicSlug.js';
import { getPublicBusinessProfileBySlug } from '../PublicBusinessProfileService.js';
import type { NormalizedBusinessRecord } from '../types.js';

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'profile-seed-1',
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

describe('Public business profile by slug', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'profile-slug-test',
      String(Date.now()),
    );
    await resetIngestionDataForTests();
  });

  it('builds stable public slug and profile URL on discovery cards', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized({ id: 'slug-1' }),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 88,
      qualityTier: 'high_quality',
    });
    await upsertSeedRecords([seed]);
    await approveSeed('slug-1', 'admin-qa');
    const approved = await getSeedRecordById('slug-1');
    expect(approved).toBeTruthy();

    const slug = buildPublicBusinessSlug(approved!);
    expect(slug).toMatch(/^harbour-cafe-melbourne-[a-z0-9]+$/);

    const card = await buildPublicDiscoveryCard(approved!);
    expect(card?.slug).toBe(slug);
    expect(card?.profileUrl).toBe(`/business/${slug}`);
  });

  it('getPublicBusinessProfileBySlug returns safe public fields only', async () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized({ id: 'profile-1' }),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 88,
      qualityTier: 'high_quality',
    });
    await upsertSeedRecords([seed]);
    await approveSeed('profile-1', 'admin-qa');

    const approved = await getSeedRecordById('profile-1');
    const slug = buildPublicBusinessSlug(approved!);
    const profile = await getPublicBusinessProfileBySlug(slug);
    expect(profile).toBeTruthy();
    expect(profile?.businessName).toBe('Harbour Cafe');
    expect(profile?.lifecycleLabel).toBe('Discovered');
    expect(profile?.claimUrl).toBe('/activate-business/profile-1');
    const { briefSummary: _brief, ...publicCore } = profile!;
    expect(JSON.stringify(publicCore)).not.toContain('sourceType');
    expect(JSON.stringify(publicCore)).not.toContain('verificationStatus');
    expect(JSON.stringify(publicCore)).not.toContain('confidenceScore');
  });
});
