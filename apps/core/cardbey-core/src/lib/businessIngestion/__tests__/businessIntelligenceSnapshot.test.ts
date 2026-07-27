import { describe, expect, it } from 'vitest';
import { buildIngestedSeedRecord } from '../SeedGovernance.js';
import { generateBusinessIntelligenceSnapshot } from '../generateBusinessIntelligenceSnapshot.js';
import type { EnrichmentCandidate, NormalizedBusinessRecord } from '../types.js';

function makeNormalized(overrides: Partial<NormalizedBusinessRecord> = {}): NormalizedBusinessRecord {
  const now = new Date().toISOString();
  return {
    id: 'seed-bi-1',
    businessName: 'Acme Cafe',
    legalName: null,
    address: '1 High St, Melbourne',
    phone: '+61400111222',
    website: 'https://acme.example.com',
    category: 'cafe',
    categoryConfidence: 0.85,
    registrationNumber: null,
    email: 'hello@acme.example.com',
    operatingRegion: 'AU-VIC',
    country: 'Australia',
    state: 'VIC',
    city: 'Melbourne',
    confidenceScore: 0.8,
    sourceType: 'open_data_url',
    sourceReference: 'test',
    sourceRowId: '1',
    ingestedAt: now,
    ...overrides,
  };
}

describe('generateBusinessIntelligenceSnapshot', () => {
  it('scores visibility, completeness, and engagement from seed facts', () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized(),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 85,
      qualityTier: 'high_quality',
    });

    const snapshot = generateBusinessIntelligenceSnapshot(seed, []);
    expect(snapshot.version).toBe('v1');
    expect(snapshot.visibilityScore).toBeGreaterThan(50);
    expect(snapshot.completenessScore).toBeGreaterThan(50);
    expect(snapshot.strengths).toContain('Website present');
    expect(snapshot.recommendedActions.map((a) => a.label)).toContain('Activate Business Space');
    expect(snapshot.summary).toMatch(/We analyzed Acme Cafe/);
  });

  it('incorporates enrichment candidates for hours and social', () => {
    const seed = buildIngestedSeedRecord({
      normalized: makeNormalized(),
      resolution: 'unique',
      matchEvidence: [],
      qualityScore: 85,
      qualityTier: 'high_quality',
    });
    const candidates: EnrichmentCandidate[] = [
      {
        id: 'c-1',
        seedId: seed.id,
        field: 'opening_hours',
        value: '{"weekday_text":["Mon 9-5"]}',
        sourceUrl: 'https://acme.example.com',
        confidence: 0.9,
        permissionType: 'schema_org',
        status: 'suggested',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'c-2',
        seedId: seed.id,
        field: 'social_links',
        value: '["https://instagram.com/acme"]',
        sourceUrl: 'https://acme.example.com',
        confidence: 0.8,
        permissionType: 'open_graph',
        status: 'suggested',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const snapshot = generateBusinessIntelligenceSnapshot(seed, candidates);
    expect(snapshot.strengths).toContain('Opening hours available');
    expect(snapshot.engagementReadinessScore).toBeGreaterThan(50);
    expect(
      snapshot.strengths.some((s) => s.includes('Social')) ||
        snapshot.opportunities.some((o) => o.includes('social')),
    ).toBe(true);
  });
});
