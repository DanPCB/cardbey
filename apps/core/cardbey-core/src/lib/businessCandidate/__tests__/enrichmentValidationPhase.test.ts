/**
 * Phase validation tests: provenance safety, identity, synthesis, media, readiness.
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  appendCandidateFieldProvenance,
  deleteProvenanceForRun,
  listProvenanceForRun,
  resetCandidateProvenanceForTests,
  provenanceFilePathForTests,
  MAX_PROVENANCE_ROWS,
  PROVENANCE_RUNTIME_CLASSIFICATION,
} from '../enrichment/provenanceRepository.js';
import { resolveIdentityMatch } from '../enrichment/identityGate.js';
import {
  minimalGroundedDescription,
  validateSynthesizedDescription,
  SYNTHESIS_POLICY_VERSION,
} from '../enrichment/synthesize.js';
import { evaluateCandidateReadiness } from '../enrichment/readinessEvaluator.js';
import { findCandidateByDisplayName } from '../enrichment/inventoryRecovery.js';
import type { BusinessCandidateRecord } from '../types.js';

describe('provenance repository safety', () => {
  let tmpDir: string;
  const prev = process.env.BUSINESS_CANDIDATE_DIR;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'prov-safe-'));
    process.env.BUSINESS_CANDIDATE_DIR = tmpDir;
    await resetCandidateProvenanceForTests();
  });

  afterEach(async () => {
    if (prev === undefined) delete process.env.BUSINESS_CANDIDATE_DIR;
    else process.env.BUSINESS_CANDIDATE_DIR = prev;
    await rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  });

  it('classifies sidecar as pilot runtime bridge', () => {
    expect(PROVENANCE_RUNTIME_CLASSIFICATION).toBe('development_pilot_runtime_state_temporary_bridge');
    expect(MAX_PROVENANCE_ROWS).toBeGreaterThan(1000);
  });

  it('serializes concurrent appends without losing rows', async () => {
    await Promise.all([
      appendCandidateFieldProvenance([
        {
          enrichmentRunId: 'runA',
          candidateId: 'c1',
          field: 'description',
          source: 'business_website',
          sourceTier: 1,
          sourceUrl: 'https://a.example',
          confidence: 0.9,
          rawExtract: 'a',
        },
      ]),
      appendCandidateFieldProvenance([
        {
          enrichmentRunId: 'runB',
          candidateId: 'c1',
          field: 'category',
          source: 'openstreetmap',
          sourceTier: 2,
          sourceUrl: null,
          confidence: 0.8,
          rawExtract: 'cafe',
        },
      ]),
    ]);
    const a = await listProvenanceForRun('runA');
    const b = await listProvenanceForRun('runB');
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  it('idempotent duplicate run/field does not duplicate rows', async () => {
    const row = {
      enrichmentRunId: 'runDup',
      candidateId: 'c1',
      field: 'description',
      source: 'business_website' as const,
      sourceTier: 1 as const,
      sourceUrl: 'https://a.example',
      confidence: 0.9,
      rawExtract: 'same',
    };
    await appendCandidateFieldProvenance([row]);
    await appendCandidateFieldProvenance([row]);
    expect(await listProvenanceForRun('runDup')).toHaveLength(1);
  });

  it('rollback deletes only the selected run', async () => {
    await appendCandidateFieldProvenance([
      {
        enrichmentRunId: 'keep',
        candidateId: 'c1',
        field: 'description',
        source: 'rule_synthesised',
        sourceTier: 3,
        sourceUrl: null,
        confidence: 0.5,
        rawExtract: 'keep',
      },
      {
        enrichmentRunId: 'drop',
        candidateId: 'c1',
        field: 'description',
        source: 'rule_synthesised',
        sourceTier: 3,
        sourceUrl: null,
        confidence: 0.5,
        rawExtract: 'drop',
      },
    ]);
    expect(await deleteProvenanceForRun('drop')).toBe(1);
    expect(await listProvenanceForRun('keep')).toHaveLength(1);
    expect(await listProvenanceForRun('drop')).toHaveLength(0);
  });

  it('malformed file recovers to empty after quarantine', async () => {
    const file = provenanceFilePathForTests(false);
    await writeFile(file, '{not-json', 'utf8');
    await appendCandidateFieldProvenance([
      {
        enrichmentRunId: 'after-corrupt',
        candidateId: 'c1',
        field: 'tags',
        source: 'rule_synthesised',
        sourceTier: 3,
        sourceUrl: null,
        confidence: 0.5,
        rawExtract: '[]',
      },
    ]);
    expect(await listProvenanceForRun('after-corrupt')).toHaveLength(1);
    const raw = await readFile(file, 'utf8');
    expect(JSON.parse(raw)).toHaveLength(1);
  });

  it('dry-run provenance is isolated from live sidecar', async () => {
    await appendCandidateFieldProvenance(
      [
        {
          enrichmentRunId: 'dry1',
          candidateId: 'c1',
          field: 'description',
          source: 'rule_synthesised',
          sourceTier: 3,
          sourceUrl: null,
          confidence: 0.5,
          rawExtract: '[DRY_RUN] x',
        },
      ],
      { dryRun: true },
    );
    expect(await listProvenanceForRun('dry1', { dryRun: true })).toHaveLength(1);
    expect(await listProvenanceForRun('dry1', { dryRun: false })).toHaveLength(0);
  });
});

describe('identity gate', () => {
  it('does not merge same name different suburb', () => {
    const r = resolveIdentityMatch(
      { name: 'ABC Cafe', suburb: 'Braybrook' },
      { name: 'ABC Cafe', suburb: 'Footscray' },
    );
    expect(r.result).toBe('CONFLICT');
  });

  it('phone conflict is ambiguous', () => {
    const r = resolveIdentityMatch(
      { name: 'ABC Cafe', suburb: 'Braybrook', phone: '0391111111' },
      { name: 'ABC Cafe', suburb: 'Braybrook', phone: '0392222222' },
    );
    expect(r.result).toBe('AMBIGUOUS');
  });

  it('ABR-only match is not sufficient for marketing MATCHED', () => {
    const r = resolveIdentityMatch(
      { name: 'Trading Name Pty Ltd', abn: '123' },
      { name: 'Different Trading', abn: '123' },
      { abrOnly: true },
    );
    expect(['PROBABLE_MATCH', 'NOT_MATCHED', 'AMBIGUOUS']).toContain(r.result);
    expect(r.result).not.toBe('MATCHED');
  });

  it('does not identify target by display name alone', () => {
    const list = [
      {
        id: 'candidate:1',
        name: 'Petit Cafe',
        seedId: 'a1e824e8-9352-47ee-8395-6fc8454d8a98',
      } as BusinessCandidateRecord,
    ];
    expect(findCandidateByDisplayName(list, 'Đại Thắng')).toBeNull();
    expect(findCandidateByDisplayName(list, 'Petit Cafe')?.seedId).toBe(
      'a1e824e8-9352-47ee-8395-6fc8454d8a98',
    );
  });
});

describe('synthesis evidence grounding', () => {
  it('rejects unsupported product inferences', () => {
    const input = {
      businessName: 'Example Fencing',
      category: 'Fencing',
      suburb: 'Braybrook',
      websiteDescription: null,
      instagramBio: null,
      facebookAbout: null,
      cuisineOrSpecialty: null,
    };
    const bad = validateSynthesizedDescription(
      'Example Fencing offers Colorbond fencing, timber fencing, gate repair and free quotes in Braybrook.',
      input,
    );
    expect(bad.ok).toBe(false);
    expect(bad.rejectedClaims.some((c) => c.startsWith('unsupported_inference'))).toBe(true);
  });

  it('allows minimal grounded description', () => {
    const input = {
      businessName: 'Example Fencing',
      category: 'Fencing',
      suburb: 'Braybrook',
      websiteDescription: null,
      instagramBio: null,
      facebookAbout: null,
      cuisineOrSpecialty: null,
    };
    const text = minimalGroundedDescription(input);
    expect(text).toBe('Example Fencing is listed as a fencing business in Braybrook.');
    const ok = validateSynthesizedDescription(text, input);
    expect(ok.ok).toBe(true);
    expect(SYNTHESIS_POLICY_VERSION).toBe('enrichment-synthesis-v1');
  });

  it('rejects unsupported marketing adjectives', () => {
    const input = {
      businessName: 'Example Fencing',
      category: 'Fencing',
      suburb: 'Braybrook',
      websiteDescription: null,
      instagramBio: null,
      facebookAbout: null,
      cuisineOrSpecialty: null,
    };
    const r = validateSynthesizedDescription(
      'Example Fencing is the premier leading fencing business in Braybrook.',
      input,
    );
    expect(r.rejectedClaims).toContain('unsupported_marketing_adjective');
  });
});

describe('readiness evaluator', () => {
  it('keeps sparse recovered seed below RICH_PROFILE_READY', () => {
    const candidate = {
      name: 'Papa Bakehouse',
      seedId: '145c96c7-fc80-4e74-81df-b52a172bb8fc',
      suburb: 'Braybrook',
      address: '11 Market Place, Braybrook',
      website: null,
      phone: null,
      description: 'Papa Bakehouse is listed as a food business in Braybrook.',
      heroImageUrl: null,
      heroImageSource: null,
      openingHours: null,
      fetchedServices: [],
      abn: null,
      biStatus: 'generated',
    } as unknown as BusinessCandidateRecord;

    const before = evaluateCandidateReadiness(candidate, {
      aiDescriptionOnly: true,
      eligibleMedia: false,
      catalogCount: 0,
      provenanceCount: 0,
    });
    expect(before.tier).toBe('DISCOVERED_SPARSE');
    expect(before.publicMinimum).toBe(false);
    expect(before.businessHealthEligible).toBe(false);
  });
});
