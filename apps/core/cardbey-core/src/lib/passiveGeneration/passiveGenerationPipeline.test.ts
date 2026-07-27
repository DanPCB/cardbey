import { describe, it, expect } from 'vitest';

import {
  structureIntent,
  detectMissingData,
  runPassiveGenerationPipeline,
  mergeAcquiredData,
  planArtifacts,
} from './index.js';

describe('passiveGeneration foundation', () => {
  it('structures intent from "Create a page for MC Hair Salon"', () => {
    const intent = structureIntent({ text: 'Create a page for MC Hair Salon in Melbourne' });
    expect(intent.intentType).toBe('create_business_surface');
    expect(intent.entities.businessName).toBeTruthy();
    expect(intent.desiredOutcome).toContain('storefront');
    expect(intent.missingFields.length).toBeGreaterThan(0);
  });

  it('structures coffee shop website intent with missing fields', () => {
    const intent = structureIntent({ text: 'I want a coffee shop website' });
    expect(intent.entities.businessType).toBe('cafe');
    expect(intent.desiredOutcome).toContain('website');
    const gaps = detectMissingData(intent);
    expect(gaps.some((g) => g.field === 'businessName')).toBe(true);
    expect(gaps.some((g) => g.field === 'menu' || g.field === 'heroMedia')).toBe(true);
  });

  it('structures demand intent for wedding photographer', () => {
    const intent = structureIntent({ text: 'I need a wedding photographer in Sydney' });
    expect(intent.intentType).toBe('create_demand');
    const gaps = detectMissingData(intent);
    expect(gaps.some((g) => g.field === 'supplierCandidates')).toBe(true);
  });

  it('structures menu upload intent', () => {
    const intent = structureIntent({
      text: 'Here is our menu',
      uploads: [{ type: 'menu', name: 'menu.jpg' }],
    });
    expect(intent.intentType).toBe('enrich_catalog');
    expect(intent.entities.hasMenuUpload).toBe(true);
  });

  it('mergeAcquiredData combines user + acquired with provenance', () => {
    const entity = mergeAcquiredData({
      userEntities: { businessName: 'MC Hair Salon' },
      acquisitions: [
        {
          task: 'search_business',
          sourceId: 'business_discovery',
          ok: true,
          data: { address: '12 Collins St', rating: 4.5, reviewCount: 20 },
        },
      ],
    });
    expect(entity.canonicalName.value).toBe('MC Hair Salon');
    expect(entity.geo.value.address).toBe('12 Collins St');
    expect(entity.confidence).toBeGreaterThan(0);
    expect(entity.provenance.length).toBeGreaterThan(0);
  });

  it('planArtifacts requires confirmation in Phase 1', () => {
    const intent = structureIntent({ text: 'Create a page for Test Cafe' });
    const entity = mergeAcquiredData({ userEntities: intent.entities });
    const plan = planArtifacts(intent, entity);
    expect(plan.confirmationRequired).toBe(true);
    expect(plan.exposure.every((e) => e.autoExpose === false)).toBe(true);
  });

  it('runPassiveGenerationPipeline returns performer summary and confirmation gate', async () => {
    const result = await runPassiveGenerationPipeline({
      text: 'Create a page for MC Hair Salon Melbourne',
      dryRun: true,
    });
    expect(result.ok).toBe(true);
    expect(result.confirmationRequired).toBe(true);
    expect(result.performerSummary.length).toBeGreaterThan(0);
    expect(result.traceSummary.stages).toContain('confirmation_gate');
    expect(result.intent.intentType).toBe('create_business_surface');
  });
});
