/**
 * Multi-source enrichment — unit tests (no live network required for core guards).
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { BusinessCandidateRecord } from '../types.js';
import { EnrichmentBudget, EnrichmentBudgetExhaustedError } from '../enrichment/budget.js';
import { PROTECTED_BATCH_IDS, MAX_WEB_FETCHES_PER_RECORD } from '../enrichment/constants.js';
import { mapToCardbeyCategory, isDefaultOtherCategory, resolveCategory } from '../enrichment/categoryMap.js';
import {
  appendCandidateFieldProvenance,
  listProvenanceForRun,
  resetCandidateProvenanceForTests,
  deleteProvenanceForRun,
} from '../enrichment/provenanceRepository.js';
import { runMultiSourceEnrichmentOnCandidates } from '../enrichment/runBatchEnrichment.js';
import { __test as agentTest } from '../enrichment/multiSourceEnrichmentAgent.js';
import { resetBusinessCandidatesForTests, saveBusinessCandidate } from '../candidateRepository.js';

vi.mock('../enrichment/abrLookup.js', () => ({
  lookupAbnPublic: vi.fn(async () => null),
}));
vi.mock('../enrichment/webExtractors.js', () => ({
  extractFromBusinessWebsite: vi.fn(async () => null),
  extractPublicSocialProfile: vi.fn(async () => null),
  extractYellowPagesSnippet: vi.fn(async () => null),
  extractTrueLocalSnippet: vi.fn(async () => null),
  extractSocialLinksFromHtml: vi.fn(() => []),
}));
vi.mock('../enrichment/osmCrossRef.js', () => ({
  queryOsmOverpass: vi.fn(async () => null),
}));
vi.mock('../enrichment/heroImageResolve.js', () => ({
  resolveHeroImage: vi.fn(async () => ({
    hero: null,
    status: 'NO_ELIGIBLE_MEDIA',
    adapterResults: [],
  })),
}));

function sampleCandidate(overrides: Partial<BusinessCandidateRecord> = {}): BusinessCandidateRecord {
  const now = new Date().toISOString();
  return {
    id: 'cand-enrich-1',
    batchId: 'MELBOURNE_BATCH001_REAL_LOCAL',
    campaignId: 'cardbey-batch-001-melbourne-west',
    name: 'Test Cafe Braybrook',
    businessType: 'cafe',
    address: '1 Test St',
    suburb: 'Braybrook',
    city: 'Braybrook',
    state: 'VIC',
    postcode: '3019',
    country: 'AU',
    phone: null,
    website: null,
    email: null,
    socialLinks: [],
    coordinates: null,
    discoveredFrom: 'osm',
    confidenceScore: 0.7,
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
    placeId: null,
    sourceUrl: null,
    rawSourceJson: null,
    seedId: null,
    status: 'PENDING_QA',
    dedupeKey: 'test-cafe|braybrook',
    discoveryProviderId: 'osm',
    externalId: 'ext-enrich-1',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('multi-source enrichment guards', () => {
  let tmpDir: string;
  const prevDir = process.env.BUSINESS_CANDIDATE_DIR;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'cand-enrich-'));
    process.env.BUSINESS_CANDIDATE_DIR = tmpDir;
    await resetBusinessCandidatesForTests();
    await resetCandidateProvenanceForTests();
  });

  afterEach(async () => {
    if (prevDir === undefined) delete process.env.BUSINESS_CANDIDATE_DIR;
    else process.env.BUSINESS_CANDIDATE_DIR = prevDir;
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('keeps fixtures valid when optional enrichment fields are omitted', () => {
    const c = sampleCandidate();
    expect(c.description).toBeUndefined();
    expect(c.biStatus).toBeUndefined();
    expect(c.heroImageUrl).toBeUndefined();
    expect(c.enrichmentRunId).toBeUndefined();
  });

  it('skips protected Batch 0 inside the enrichment loop', async () => {
    const protectedCand = sampleCandidate({
      id: 'cand-batch0',
      batchId: PROTECTED_BATCH_IDS[0],
      name: 'Brunetti Carlton',
      status: 'PENDING_QA',
    });
    await saveBusinessCandidate(protectedCand);

    const batch = await runMultiSourceEnrichmentOnCandidates({
      candidates: [protectedCand],
      dryRun: true,
      writeReport: false,
    });

    expect(batch.summary.skipped).toBe(1);
    expect(batch.results[0]?.status).toBe('SKIPPED');
    expect(batch.results[0]?.flags).toContain('PROTECTED_BATCH');
  });

  it('enforces fetch cap as a hard error', () => {
    const budget = new EnrichmentBudget(2, 3, 60_000);
    budget.consumeFetch();
    budget.consumeFetch();
    expect(() => budget.consumeFetch()).toThrow(EnrichmentBudgetExhaustedError);
    try {
      budget.consumeFetch();
    } catch (err) {
      expect(err).toBeInstanceOf(EnrichmentBudgetExhaustedError);
      expect((err as EnrichmentBudgetExhaustedError).code).toBe('FETCH_CAP');
    }
    expect(MAX_WEB_FETCHES_PER_RECORD).toBe(5);
  });

  it('enforces Claude cap as a hard error', () => {
    const budget = new EnrichmentBudget(5, 1, 60_000);
    budget.consumeClaude();
    expect(() => budget.consumeClaude()).toThrow(EnrichmentBudgetExhaustedError);
  });

  it('enforces wall-clock timeout via runWithDeadline', async () => {
    const budget = new EnrichmentBudget(5, 3, 30);
    await expect(
      budget.runWithDeadline(async () => {
        await new Promise((r) => setTimeout(r, 80));
        return 'ok';
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });

  it('writes provenance rows with enrichmentRunId and supports run delete', async () => {
    const enrichmentRunId = 'run_test_123';
    await appendCandidateFieldProvenance([
      {
        enrichmentRunId,
        candidateId: 'cand-enrich-1',
        field: 'description',
        source: 'business_website',
        sourceTier: 1,
        sourceUrl: 'https://example.com',
        confidence: 0.95,
        rawExtract: 'A cafe in Braybrook serving coffee and food.',
      },
    ]);
    const rows = await listProvenanceForRun(enrichmentRunId);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.enrichmentRunId).toBe(enrichmentRunId);
    expect(rows[0]?.id).toBeTruthy();

    const removed = await deleteProvenanceForRun(enrichmentRunId);
    expect(removed).toBe(1);
    expect(await listProvenanceForRun(enrichmentRunId)).toHaveLength(0);
  });

  it('maps cafe signals to Food & Drink and rejects bare Other for quality floor', () => {
    const mapped = mapToCardbeyCategory({
      businessName: 'Petit Cafe',
      businessType: 'cafe',
    });
    expect(mapped.category).toBe('Food & Drink');
    expect(isDefaultOtherCategory('Other')).toBe(true);
    expect(
      agentTest.qualityFloor({
        description:
          'Petit Cafe is a cafe business in Braybrook. It operates in the food and drink category near local shops and serves coffee to the surrounding community each day.',
        category: 'Food & Drink',
        biStatus: 'generated',
      }),
    ).toBe(true);
    expect(
      agentTest.qualityFloor({
        description: 'Too short',
        category: 'Food & Drink',
        biStatus: 'generated',
      }),
    ).toBe(false);
  });

  it('maps pub/hotel names and Google types to Food & Drink', () => {
    expect(
      resolveCategory('Braybrook Hotel', ['bar', 'pub', 'hotel', 'establishment']),
    ).toBe('Food & Drink');
    const mapped = mapToCardbeyCategory({
      businessName: 'Braybrook Hotel',
      placesTypes: ['bar', 'pub', 'hotel'],
    });
    expect(mapped.category).toBe('Food & Drink');
    expect(mapped.tags).toContain('pub-bar');
  });

  it('detects frozen-field mutation', () => {
    const c = sampleCandidate();
    const snap = agentTest.snapshotFrozen(c);
    expect(() =>
      agentTest.assertFrozenUnchanged(snap, { ...c, batchId: 'OTHER_BATCH' }),
    ).toThrow(/Frozen field mutated/);
  });

  it('does not mutate status/batchId/seedId on enrich', async () => {
    const { enrichCandidateMultiSource } = await import(
      '../enrichment/multiSourceEnrichmentAgent.js'
    );
    const candidate = sampleCandidate({
      id: 'cand-freeze-1',
      website: 'https://example-cafe.test',
      seedId: 'seed-frozen-1',
      status: 'PENDING_QA',
      batchId: 'MELBOURNE_BATCH001_REAL_LOCAL',
      dedupeKey: 'freeze|test',
    });
    await saveBusinessCandidate(candidate);

    const { result, candidate: after } = await enrichCandidateMultiSource({
      candidate,
      enrichmentRunId: 'run_freeze_1',
      dryRun: false,
    });

    expect(after.status).toBe('PENDING_QA');
    expect(after.batchId).toBe('MELBOURNE_BATCH001_REAL_LOCAL');
    expect(after.seedId).toBe('seed-frozen-1');
    expect(after.enrichmentRunId).toBe('run_freeze_1');
    expect(['ENRICHED', 'PARTIAL', 'TIMEOUT']).toContain(result.status);

    const prov = await listProvenanceForRun('run_freeze_1');
    for (const row of prov) {
      expect(row.enrichmentRunId).toBe('run_freeze_1');
      expect(row.candidateId).toBe(candidate.id);
    }
  });

  it('does not ENRICHMENT_ERROR when socialLinks is null (backfill candidates)', async () => {
    const thin = sampleCandidate({
      id: 'published:cmqz-test',
      batchId: 'PUBLISHED_STORES_BACKFILL',
      storeId: 'cmqz-test',
      status: 'PENDING_QA',
      socialLinks: null as unknown as BusinessCandidateRecord['socialLinks'],
      website: null,
      phone: null,
    });

    const { enrichCandidateMultiSource } = await import(
      '../enrichment/multiSourceEnrichmentAgent.js'
    );
    const { result } = await enrichCandidateMultiSource({
      candidate: thin,
      enrichmentRunId: 'run-null-social',
      dryRun: true,
    });

    expect(result.flags).not.toContain('ENRICHMENT_ERROR');
    expect(['ENRICHED', 'PARTIAL', 'TIMEOUT']).toContain(result.status);
  });
});
