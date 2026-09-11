/**
 * @vitest-environment node
 */
import { describe, it, expect } from 'vitest';
import { createMockLlmGenerate } from '../../marketIntent/__tests__/mockMarketIntentLlm.js';
import { analyzeGrowYourBusinessIntent, previewGrowYourBusinessIntent } from '../growYourBusinessService.js';
import { projectGrowUnderstanding, mergeBusinessContextIntoHas } from '../projectGrowUnderstanding.js';
import { buildGraphNodeFromSpec } from '../../marketIntent/__tests__/matchTestHelpers.js';
import type { ListedGraphNode } from '../../marketIntent/capital/persistentMarketGraphStore.js';
import type { MarketIntentAnalysis } from '../../marketIntent/types.js';

const mockLlm = createMockLlmGenerate();

const VI_ICE =
  'Chúng tôi là công ty sản xuất đá dẻo tại Việt Nam, tìm nhà phân phối tại thị trường Australia.';
const EN_ICE = 'We manufacture flexible ice in Vietnam and are looking for distributors in Australia.';

function asListed(node: ReturnType<typeof buildGraphNodeFromSpec>, extra?: Partial<ListedGraphNode>): ListedGraphNode {
  const now = new Date().toISOString();
  return {
    ...node,
    admittedAt: now,
    updatedAt: now,
    freshnessAt: now,
    admissionState: 'admitted',
    ...extra,
  };
}

describe('growYourBusinessService', () => {
  it('extracts HAS/WANT for Vietnamese manufacturer seeking Australian distributors', async () => {
    const result = await analyzeGrowYourBusinessIntent(
      { rawText: VI_ICE, userId: 'user-1' },
      { llmGenerate: mockLlm, listCounterparties: async () => [], loadBusinessContext: async () => null },
    );

    expect(result.ok).toBe(true);
    expect(result.status).toBe('understood');
    expect(result.understanding?.youHave.label).toMatch(/đá dẻo|Sản xuất đá dẻo/i);
    expect(result.understanding?.youHave.location).toMatch(/Việt Nam|Vietnam/i);
    expect(result.understanding?.youWant.label).toMatch(/Nhà phân phối|distributor/i);
    expect(result.understanding?.youWant.location).toMatch(/Australia/i);
    expect(JSON.stringify(result)).not.toMatch(/G1|G2|G3|G4|Market Intent|graph admission|sourceRef/i);
  });

  it('extracts HAS/WANT for the English equivalent', async () => {
    const result = await analyzeGrowYourBusinessIntent(
      { rawText: EN_ICE, userId: 'user-1' },
      { llmGenerate: mockLlm, listCounterparties: async () => [], loadBusinessContext: async () => null },
    );

    expect(result.ok).toBe(true);
    expect(result.understanding?.youHave.label).toMatch(/flexible\/soft ice|manufacturing/i);
    expect(result.understanding?.youHave.location).toMatch(/Vietnam/i);
    expect(result.understanding?.youWant.label).toMatch(/Distributor/i);
    expect(result.understanding?.youWant.location).toMatch(/Australia/i);
  });

  it('enriches HAS from existing business context without overwriting the profile payload', async () => {
    const result = await analyzeGrowYourBusinessIntent(
      { rawText: 'I want buyers in Australia.', userId: 'user-1', storeId: 'store-1' },
      {
        llmGenerate: mockLlm,
        listCounterparties: async () => [],
        loadBusinessContext: async () => ({
          storeId: 'store-1',
          name: 'ABC Packaging',
          type: 'flexible packaging manufacturing',
          tagline: null,
          country: 'Vietnam',
          city: null,
        }),
      },
    );

    expect(result.understanding?.usedBusinessContext).toBe(true);
    expect(result.understanding?.youHave.label).toMatch(/ABC Packaging|flexible packaging/i);
    expect(result.understanding?.youHave.location).toMatch(/Vietnam/i);
  });

  it('guest preview reuses semantic understanding without matching or persistence', async () => {
    const result = await previewGrowYourBusinessIntent(
      { rawText: EN_ICE },
      { llmGenerate: mockLlm },
    );

    expect(result.ok).toBe(true);
    expect(result.guestPreview).toBe(true);
    expect(result.opportunities).toEqual([]);
    expect(result.understanding?.youHave.location).toMatch(/Vietnam/i);
    expect(result.understanding?.youWant.label).toMatch(/Distributor/i);
    expect(result.nextActions.map((a) => a.id)).not.toContain('save_request');
    expect(JSON.stringify(result)).not.toMatch(/G1|G2|G3|G4|Market Intent|graph admission|sourceRef/i);
  });

  it('returns empty opportunities without fabricating matches', async () => {
    const result = await analyzeGrowYourBusinessIntent(
      { rawText: VI_ICE, userId: 'user-1' },
      { llmGenerate: mockLlm, listCounterparties: async () => [], loadBusinessContext: async () => null },
    );

    expect(result.empty).toBe(true);
    expect(result.opportunities).toEqual([]);
    expect(result.nextActions.map((a) => a.id)).toEqual([
      'research_market',
      'create_promotion',
      'improve_profile',
      'save_request',
    ]);
  });

  it('returns evidence-supported match results when a reciprocal counterparty exists', async () => {
    const distributor = asListed(
      buildGraphNodeFromSpec({
        kind: 'anchor',
        nodeId: 'au-ice-distributor',
        label: 'Sydney frozen goods distributor',
        rawText: 'We distribute frozen food in Australia and want Vietnamese ice manufacturers.',
        g1Override: {
          classification: 'COMMERCIAL',
          classificationConfidence: 0.9,
          classificationReason: 'Distributor seeking ice manufacturers',
          classificationEvidence: [],
          intents: [{ family: 'SUPPLY', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
          has: [
            { type: 'CAPABILITY', label: 'frozen goods distribution', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
            { type: 'BUSINESS', label: 'Australian distributor', confidence: 0.88, basis: 'EXPLICIT', evidence: [] },
            { type: 'LOCATION', label: 'Australia', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
          ],
          wants: [
            { type: 'SUPPLIER', label: 'Vietnamese ice manufacturers', confidence: 0.92, basis: 'EXPLICIT', evidence: [] },
          ],
          locationHint: 'Australia',
        },
      }),
      { sourceType: 'cardbey_native' },
    );

    const result = await analyzeGrowYourBusinessIntent(
      { rawText: EN_ICE, userId: 'user-1' },
      {
        llmGenerate: mockLlm,
        listCounterparties: async () => [distributor],
        loadBusinessContext: async () => null,
      },
    );

    expect(result.empty).toBe(false);
    expect(result.opportunities.length).toBeGreaterThan(0);
    expect(result.opportunities[0].kind).toMatch(/potential_match|research_candidate|verified_match/);
    expect(result.opportunities[0].whoWhat).toBeTruthy();
    expect(result.opportunities[0].matchWhy).toBeTruthy();
  });

  it('returns retryable failure when analysis throws', async () => {
    const result = await analyzeGrowYourBusinessIntent(
      { rawText: EN_ICE, userId: 'user-1' },
      {
        llmGenerate: async () => {
          throw new Error('upstream timeout');
        },
        forceRuleAssisted: false,
        listCounterparties: async () => [],
        loadBusinessContext: async () => null,
      },
    );

    expect(result.ok).toBe(false);
    expect(result.status).toBe('failed');
    expect(result.retryable).toBe(true);
  });
});

describe('projectGrowUnderstanding', () => {
  it('splits location from capability labels', () => {
    const understanding = projectGrowUnderstanding({
      classificationConfidence: 0.9,
      has: [
        { type: 'CAPABILITY', label: 'Sản xuất đá dẻo', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { type: 'LOCATION', label: 'Việt Nam', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
      ],
      wants: [
        { type: 'DISTRIBUTOR', label: 'Nhà phân phối', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
        { type: 'MARKET_ACCESS', label: 'Australia', confidence: 0.9, basis: 'EXPLICIT', evidence: [] },
      ],
    } as MarketIntentAnalysis);

    expect(understanding.youHave.label).toBe('Sản xuất đá dẻo');
    expect(understanding.youHave.location).toBe('Việt Nam');
    expect(understanding.youWant.label).toBe('Nhà phân phối');
    expect(understanding.youWant.location).toBe('Australia');
  });

  it('merges known business HAS without dropping user wants', () => {
    const merged = mergeBusinessContextIntoHas([], {
      storeId: 's1',
      name: 'ABC Packaging',
      type: 'flexible packaging manufacturing',
      tagline: null,
      country: 'Vietnam',
      city: null,
    });
    expect(merged.usedBusinessContext).toBe(true);
    expect(merged.has.some((h) => h.label === 'ABC Packaging')).toBe(true);
    expect(merged.has.some((h) => /Vietnam/i.test(h.label))).toBe(true);
  });
});
