import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import sharp from 'sharp';
import { buildIngestedSeedRecord } from '../../businessIngestion/SeedGovernance.js';
import { upsertSeedRecords, resetIngestionDataForTests, getSeedRecordById } from '../../businessIngestion/IngestionRepository.js';
import { QA_FLAG_HERO_MISSING } from '../../businessIngestion/QaQualityGates.js';
import { resetSeedCurationEventsForTests, listSeedCurationEvents } from '../seedCurationEvents.js';

vi.mock('../../storage/index.js', () => ({
  uploadBuffer: vi.fn(async () => ({ url: 'https://cdn.test/seed-hero.jpg', key: 'images/seed-hero.jpg' })),
}));

const { curateSeedHero } = await import('../curateSeedHero.js');

const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

async function largeJpeg() {
  return sharp({
    create: { width: 1600, height: 900, channels: 3, background: { r: 40, g: 40, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

function makePendingSeed(overrides = {}) {
  const now = new Date().toISOString();
  return buildIngestedSeedRecord({
    normalized: {
      id: overrides.id ?? 'seed-hero-1',
      businessName: 'Lune Croissanterie Fitzroy',
      legalName: null,
      address: '119 Rose St',
      phone: null,
      website: 'https://lunecroissanterie.com',
      category: 'bakery',
      categoryConfidence: 0.9,
      registrationNumber: null,
      email: null,
      operatingRegion: 'AU-VIC',
      country: 'Australia',
      state: 'VIC',
      city: 'Fitzroy',
      confidenceScore: 0.9,
      sourceType: 'open_data_url',
      sourceReference: 'MELBOURNE_BATCH0_20260617',
      sourceRowId: '1',
      ingestedAt: now,
    },
    resolution: 'unique',
    matchEvidence: [],
    qualityScore: 90,
    qualityTier: 'high_quality',
  });
}

describe('curateSeedHero', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'curate-hero-test',
      String(Date.now()),
    );
    await resetIngestionDataForTests();
    await resetSeedCurationEventsForTests();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('happy path URL: sets admin_curated hero, recomputes, logs event, clears HERO_MISSING', async () => {
    const jpeg = await largeJpeg();
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg', 'content-length': String(jpeg.length) }),
      arrayBuffer: async () => jpeg,
    });
    const seed = {
      ...makePendingSeed(),
      qaFlags: [QA_FLAG_HERO_MISSING],
    };
    await upsertSeedRecords([seed]);

    const result = await curateSeedHero({
      seedId: seed.id,
      adminId: 'admin-1',
      imageUrl: 'https://press.example/lune.jpg',
      note: 'press kit',
    });
    expect(result.ok).toBe(true);
    expect(result.hero.provenance).toBe('admin_curated');
    expect(result.hero.url).toBe('https://cdn.test/seed-hero.jpg');
    expect(result.completeness.blockers).not.toContain('HERO_MISSING');

    const stored = await getSeedRecordById(seed.id);
    expect(stored.qaFlags ?? []).not.toContain(QA_FLAG_HERO_MISSING);
    expect(stored.hero.provenance).toBe('admin_curated');

    const events = await listSeedCurationEvents({ seedId: seed.id });
    expect(events).toHaveLength(1);
    expect(events[0].note).toBe('press kit');
  });

  it('happy path base64', async () => {
    const jpeg = await largeJpeg();
    const seed = makePendingSeed({ id: 'seed-b64' });
    seed.id = 'seed-b64';
    seed.normalized.id = 'seed-b64';
    await upsertSeedRecords([seed]);
    const result = await curateSeedHero({
      seedId: 'seed-b64',
      adminId: 'admin-1',
      imageBase64: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
    });
    expect(result.ok).toBe(true);
    expect(result.hero.provenance).toBe('admin_curated');
  });

  it('low-res image returns 422 and writes nothing', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => TINY_PNG,
    });
    const seed = makePendingSeed({ id: 'seed-low' });
    seed.id = 'seed-low';
    seed.normalized.id = 'seed-low';
    await upsertSeedRecords([seed]);
    const result = await curateSeedHero({
      seedId: 'seed-low',
      adminId: 'admin-1',
      imageUrl: 'https://x/tiny.png',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
    expect(result.code).toBe('HERO_LOW_RES');
    const events = await listSeedCurationEvents({ seedId: 'seed-low' });
    expect(events).toHaveLength(0);
    const stored = await getSeedRecordById('seed-low');
    expect(stored.hero).toBeFalsy();
  });

  it('SVG / HTML content-type returns 422', async () => {
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/svg+xml' }),
      arrayBuffer: async () => Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
    });
    const seed = makePendingSeed({ id: 'seed-svg' });
    seed.id = 'seed-svg';
    seed.normalized.id = 'seed-svg';
    await upsertSeedRecords([seed]);
    const result = await curateSeedHero({
      seedId: 'seed-svg',
      adminId: 'admin-1',
      imageUrl: 'https://x/logo.svg',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(422);
    expect(result.code).toBe('HERO_FETCH_FAILED');
  });

  it('claimed seed returns 409', async () => {
    const seed = makePendingSeed({ id: 'seed-claimed' });
    seed.id = 'seed-claimed';
    seed.normalized.id = 'seed-claimed';
    seed.verificationStatus = 'verified_owner';
    await upsertSeedRecords([seed]);
    const result = await curateSeedHero({
      seedId: 'seed-claimed',
      adminId: 'admin-1',
      imageUrl: 'https://x/a.jpg',
    });
    expect(result.ok).toBe(false);
    expect(result.status).toBe(409);
    expect(result.code).toBe('SEED_NOT_CURATABLE');
    expect(result.state).toBe('verified_owner');
  });

  it('replacing an existing hero preserves previousValue', async () => {
    const jpeg = await largeJpeg();
    fetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/jpeg' }),
      arrayBuffer: async () => jpeg,
    });
    const seed = makePendingSeed({ id: 'seed-replace' });
    seed.id = 'seed-replace';
    seed.normalized.id = 'seed-replace';
    seed.hero = { url: 'https://old.example/hero.jpg', provenance: 'logodev', isLogoSuspect: true };
    await upsertSeedRecords([seed]);
    const result = await curateSeedHero({
      seedId: 'seed-replace',
      adminId: 'admin-1',
      imageUrl: 'https://new.example/hero.jpg',
      note: 'replacement',
    });
    expect(result.ok).toBe(true);
    const events = await listSeedCurationEvents({ seedId: 'seed-replace' });
    expect(events[0].previousValue.url).toBe('https://old.example/hero.jpg');
  });

  it('curate/hero route is requireAuth + requireAdmin', () => {
    const src = fs.readFileSync(
      path.join(path.dirname(fileURLToPath(import.meta.url)), '../../../routes/businessIngestionRoutes.js'),
      'utf8',
    );
    expect(src).toMatch(
      /router\.post\('\/seeds\/:id\/curate\/hero',\s*requireAuth,\s*requireAdmin/,
    );
  });
});
