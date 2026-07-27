/**
 * QA Promotion Layer tests (V1.1).
 */

import path from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { suggestAutoApproval, canPromoteToClaimable } from '../QaQualityGates.js';
import {
  approveSeed,
  rejectSeed,
  markSeedDuplicate,
  listClaimableSeeds,
} from '../QaPromotionService.js';
import { listQaAuditEntries } from '../QaAuditLog.js';
import { upsertSeedRecords, resetIngestionDataForTests } from '../IngestionRepository.js';
import type { NormalizedBusinessRecord, IngestedSeedRecord } from '../types.js';

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: overrides.id ?? 'seed-1',
    businessName: 'Acme Cafe',
    legalName: null,
    address: '1 High St, Melbourne, VIC, Australia',
    phone: '+61400111222',
    website: 'https://acme.example.com',
    category: 'cafe',
    categoryConfidence: 0.85,
    registrationNumber: null,
    email: null,
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.8,
    sourceType: 'open_data_url',
    sourceReference: 'test-fixture',
    sourceRowId: '1',
    ingestedAt: now,
    ...overrides,
  };
}

function makeSeed(overrides: {
  normalized?: Partial<NormalizedBusinessRecord>;
  resolution?: IngestedSeedRecord['resolution'];
  qualityScore?: number;
  qualityTier?: IngestedSeedRecord['qualityTier'];
  verificationStatus?: IngestedSeedRecord['verificationStatus'];
} = {}): IngestedSeedRecord {
  const normalized = makeNormalized(overrides.normalized);
  return buildIngestedSeedRecord({
    normalized,
    resolution: overrides.resolution ?? 'unique',
    matchEvidence: [],
    qualityScore: overrides.qualityScore ?? 85,
    qualityTier: overrides.qualityTier ?? 'high_quality',
  });
}

describe('QA Promotion V1.1', () => {
  beforeEach(async () => {
    process.env.BUSINESS_INGESTION_DIR = path.join(
      process.cwd(),
      'data',
      'businessIngestion',
      'qa-test',
      String(Date.now()),
    );
    await resetIngestionDataForTests();
  });

  it('pending seed can be approved to seeded_claimable', async () => {
    const seed = makeSeed();
    await upsertSeedRecords([seed]);

    const result = await approveSeed(seed.id, 'admin-1', 'Looks good');
    expect(result.ok).toBe(true);
    expect(result.seed?.verificationStatus).toBe('seeded_claimable');
    expect(result.seed?.claimable).toBe(true);

    const audit = await listQaAuditEntries({ seedId: seed.id });
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe('approve');
    expect(audit[0].previousStatus).toBe('seeded_pending_qa');
    expect(audit[0].nextStatus).toBe('seeded_claimable');
    expect(audit[0].reviewerId).toBe('admin-1');
  });

  it('low-quality seed cannot be auto-approved', () => {
    const seed = makeSeed({ qualityScore: 40, qualityTier: 'low_quality' });
    const suggestion = suggestAutoApproval(seed);
    expect(suggestion.suggested).toBe(false);
    expect(suggestion.reasons.some((r) => r.includes('qualityScore'))).toBe(true);
  });

  it('possible_duplicate seed cannot be auto-approved', () => {
    const seed = makeSeed({ resolution: 'possible_duplicate' });
    const suggestion = suggestAutoApproval(seed);
    expect(suggestion.suggested).toBe(false);
    expect(suggestion.reasons.some((r) => r.includes('possible_duplicate'))).toBe(true);
  });

  it('duplicate seed cannot be promoted to claimable', async () => {
    const canonical = makeSeed({ normalized: { id: 'canonical-1', businessName: 'Canonical' } });
    const dup = makeSeed({
      normalized: { id: 'dup-1', businessName: 'Dup' },
      resolution: 'duplicate',
    });
    dup.verificationStatus = 'duplicate';
    dup.claimable = false;
    await upsertSeedRecords([canonical, dup]);

    const gate = canPromoteToClaimable(dup);
    expect(gate.ok).toBe(false);

    const result = await approveSeed(dup.id, 'admin-1');
    expect(result.ok).toBe(false);
  });

  it('audit log is written on reject', async () => {
    const seed = makeSeed({ normalized: { id: 'reject-me' } });
    await upsertSeedRecords([seed]);

    const result = await rejectSeed(seed.id, 'admin-2', 'Bad data');
    expect(result.ok).toBe(true);
    expect(result.seed?.verificationStatus).toBe('rejected');

    const audit = await listQaAuditEntries({ seedId: seed.id });
    expect(audit[0].action).toBe('reject');
    expect(audit[0].reason).toBe('Bad data');
  });

  it('rejected seed is excluded from claimable view', async () => {
    const good = makeSeed({ normalized: { id: 'good-1' } });
    const approved = makeSeed({ normalized: { id: 'claimable-1' } });
    await upsertSeedRecords([good, approved]);
    await approveSeed(approved.id, 'admin-1');

    const rejected = makeSeed({ normalized: { id: 'bad-1' } });
    await upsertSeedRecords([rejected]);
    await rejectSeed(rejected.id, 'admin-1');

    const claimable = await listClaimableSeeds();
    const ids = claimable.map((s) => s.id);
    expect(ids).toContain('claimable-1');
    expect(ids).not.toContain('bad-1');
    expect(ids).not.toContain('good-1');
  });

  it('mark duplicate records canonical reference and blocks claimable', async () => {
    const canonical = makeSeed({ normalized: { id: 'canon-2' } });
    const other = makeSeed({ normalized: { id: 'other-2' } });
    await upsertSeedRecords([canonical, other]);

    const result = await markSeedDuplicate(other.id, 'admin-1', canonical.id, 'Same business');
    expect(result.ok).toBe(true);
    expect(result.seed?.verificationStatus).toBe('duplicate');
    expect(result.seed?.canonicalSeedId).toBe(canonical.id);

    const claimable = await listClaimableSeeds();
    expect(claimable.find((s) => s.id === other.id)).toBeUndefined();
  });

  it('bulk-approves auto-suggested seeds only — never active or verified', async () => {
    const uniqueHigh = makeSeed({
      normalized: { id: 'auto-1', businessName: 'Safe Shop' },
      resolution: 'unique',
      qualityScore: 88,
    });
    const lowQ = makeSeed({
      normalized: { id: 'auto-2', businessName: 'Weak Shop' },
      resolution: 'unique',
      qualityScore: 50,
    });
    const possDup = makeSeed({
      normalized: { id: 'auto-3', businessName: 'Maybe Dup' },
      resolution: 'possible_duplicate',
      qualityScore: 90,
    });
    await upsertSeedRecords([uniqueHigh, lowQ, possDup]);

    for (const seed of [uniqueHigh, lowQ, possDup]) {
      const { suggested } = suggestAutoApproval(seed);
      if (suggested) {
        const r = await approveSeed(seed.id, 'admin-bulk');
        expect(r.ok).toBe(true);
        expect(r.seed?.verificationStatus).toBe('seeded_claimable');
        expect(r.seed?.verificationStatus).not.toBe('active');
        expect(r.seed?.verificationStatus).not.toBe('verified_owner');
      }
    }

    const claimable = await listClaimableSeeds();
    expect(claimable.map((s) => s.id)).toEqual(['auto-1']);
  });
});
