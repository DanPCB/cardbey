import { describe, it, expect } from 'vitest';
import { normalizeMarketSignal, validateMarketSignalInput } from '../normalizeMarketSignal.js';
import { buildMarketSignalFingerprint } from '../signalFingerprint.js';
import { ingestMarketSignal, ingestMarketSignalBatch } from '../ingestMarketSignal.js';
import { parseMarketIntentLlmResponse } from '../marketIntentSchema.js';
import { extractMarketIntentRuleAssisted } from '../extractMarketIntentRuleAssisted.js';
import { MARKET_SIGNAL_COHORT } from './fixtures/marketSignalCohort.js';
import { createMockLlmGenerate, mockLlmResponseForText } from './mockMarketIntentLlm.js';

const mockLlm = createMockLlmGenerate();

describe('marketIntent G1 — normalization', () => {
  it('preserves raw text and provenance', () => {
    const signal = normalizeMarketSignal({
      rawText: '  Looking for distributors in Australia  ',
      sourceType: 'manual_entry',
      sourceRef: 'test-001',
      provenance: { permissionBasis: 'owner_submitted', ingestedBy: 'operator-1' },
    });
    expect(signal.rawText).toBe('Looking for distributors in Australia');
    expect(signal.sourceType).toBe('manual_entry');
    expect(signal.provenance.permissionBasis).toBe('owner_submitted');
    expect(signal.signalId).toBeTruthy();
    expect(signal.fingerprint).toHaveLength(24);
  });

  it('rejects empty rawText', () => {
    const v = validateMarketSignalInput({ rawText: '  ', sourceType: 'manual_entry' });
    expect(v.ok).toBe(false);
  });

  it('detects Vietnamese language hint', () => {
    const signal = normalizeMarketSignal({
      rawText: 'Mời hợp tác đầu tư tại Bình Dương',
      sourceType: 'community_post',
    });
    expect(signal.language).toBe('vi');
  });
});

describe('marketIntent G1 — fingerprint deduplication', () => {
  it('detects exact duplicate text from same sourceRef', async () => {
    const input = {
      rawText: 'Duplicate signal text for pilot',
      sourceType: 'csv_import' as const,
      sourceRef: 'row-dup',
    };
    const first = await ingestMarketSignal(input, { llmGenerate: mockLlm });
    const second = await ingestMarketSignal(input, {
      llmGenerate: mockLlm,
      seenFingerprints: new Map([[first.signal.fingerprint, first.signal.signalId]]),
    });
    expect(second.duplicateOfSignalId).toBe(first.signal.signalId);
  });

  it('produces stable fingerprint for same content', () => {
    const a = buildMarketSignalFingerprint({
      rawText: 'Same text',
      sourceType: 'manual_entry',
      sourceRef: 'x',
    });
    const b = buildMarketSignalFingerprint({
      rawText: 'same text',
      sourceType: 'manual_entry',
      sourceRef: 'x',
    });
    expect(a).toBe(b);
  });
});

describe('marketIntent G1 — schema and explicit/inferred', () => {
  it('parses valid LLM JSON with HAS/WANTS', () => {
    const parsed = parseMarketIntentLlmResponse(
      JSON.stringify({
        classification: 'COMMERCIAL',
        classificationConfidence: 0.9,
        classificationReason: 'test',
        classificationEvidence: [],
        intents: [{ family: 'DISTRIBUTE', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
        has: [{ type: 'PRODUCT', label: 'packaging', confidence: 0.9, basis: 'EXPLICIT', evidence: [] }],
        wants: [
          {
            type: 'DISTRIBUTOR',
            label: 'AU distributors',
            confidence: 0.85,
            basis: 'INFERRED',
            evidence: [{ statement: 'implied', span: null, basis: 'INFERRED', confidence: 0.8 }],
          },
        ],
      }),
    );
    expect(parsed.has[0]?.basis).toBe('EXPLICIT');
    expect(parsed.wants[0]?.basis).toBe('INFERRED');
  });
});

describe('marketIntent G1 — rule-assisted fallback', () => {
  it('classifies obvious non-commercial without LLM', () => {
    const signal = normalizeMarketSignal({
      rawText: 'Happy birthday to my sister!',
      sourceType: 'social_post_copy',
    });
    const result = extractMarketIntentRuleAssisted(signal);
    expect(result?.classification).toBe('NON_COMMERCIAL');
  });

  it('returns ambiguous for commercial text without LLM', () => {
    const signal = normalizeMarketSignal({
      rawText: 'Looking for distributors in Australia for our products',
      sourceType: 'manual_entry',
    });
    const result = extractMarketIntentRuleAssisted(signal);
    expect(result?.classification).toBe('AMBIGUOUS');
  });
});

describe('marketIntent G1 — scenario tests', () => {
  it('SCENARIO A: Vietnamese manufacturer seeking Australian distributors', async () => {
    const { analysis } = await ingestMarketSignal(
      {
        signalId: 'scenario-a',
        rawText:
          'Chúng tôi là nhà sản xuất bao bì thực phẩm bền vững tại Việt Nam và đang tìm nhà phân phối tại Australia.',
        sourceType: 'social_post_copy',
        sourceRef: 'scenario-a',
      },
      { llmGenerate: mockLlm },
    );

    expect(analysis.classification).toBe('COMMERCIAL');
    expect(analysis.intents.primary).toBe('DISTRIBUTE');
    expect(analysis.has.some((h) => h.type === 'PRODUCT')).toBe(true);
    expect(analysis.has.some((h) => h.type === 'LOCATION' && /vietnam/i.test(h.label))).toBe(true);
    expect(analysis.wants.some((w) => w.type === 'DISTRIBUTOR')).toBe(true);
    expect(analysis.wants.some((w) => w.type === 'MARKET_ACCESS')).toBe(true);
    expect(analysis.outcome).toBe('READY');
    expect(analysis.diagnostics.method).toBe('llm');
    expect(analysis.has.every((h) => h.basis === 'EXPLICIT' || h.basis === 'INFERRED')).toBe(true);
  });

  it('SCENARIO B: Spa chain invites partners to expand nationally', async () => {
    const { analysis } = await ingestMarketSignal(
      {
        signalId: 'scenario-b',
        rawText:
          'Our wellness spa chain is inviting franchise and operating partners to expand nationally across Australia.',
        sourceType: 'social_post_copy',
      },
      { llmGenerate: mockLlm },
    );

    expect(analysis.classification).toBe('COMMERCIAL');
    expect(['PARTNER', 'EXPAND']).toContain(analysis.intents.primary);
    expect(analysis.intents.items.some((i) => i.family === 'PARTNER')).toBe(true);
    expect(analysis.wants.some((w) => w.type === 'PARTNER')).toBe(true);
    expect(analysis.classificationEvidence).toBeDefined();
  });

  it('SCENARIO C: Used vehicle sale remains valid commercial intent', async () => {
    const { analysis } = await ingestMarketSignal(
      {
        signalId: 'scenario-c',
        rawText: 'Selling my used Toyota Camry 2018, $5,500, low kms.',
        sourceType: 'manual_entry',
      },
      { llmGenerate: mockLlm },
    );

    expect(analysis.classification).toBe('COMMERCIAL');
    expect(analysis.intents.primary).toBe('SELL');
    expect(analysis.has.some((h) => h.type === 'ASSET')).toBe(true);
    expect(analysis.wants.some((w) => w.type === 'BUYER')).toBe(true);
    expect(analysis.outcome).toBe('READY');
    // No Cardbey-fit scoring in G1
    expect((analysis as { cardbeyFit?: unknown }).cardbeyFit).toBeUndefined();
  });

  it('SCENARIO D: Non-commercial social conversation', async () => {
    const { analysis } = await ingestMarketSignal(
      {
        signalId: 'scenario-d',
        rawText: 'Happy birthday to my sister! Hope you have an amazing day',
        sourceType: 'social_post_copy',
      },
      { llmGenerate: mockLlm },
    );

    expect(analysis.classification).toBe('NON_COMMERCIAL');
    expect(analysis.outcome).toBe('NON_COMMERCIAL');
    expect(analysis.intents.primary).toBeNull();
  });

  it('SCENARIO E: Ambiguous post without invented intent', async () => {
    const { analysis } = await ingestMarketSignal(
      {
        signalId: 'scenario-e',
        rawText: 'Maybe interested in business stuff later, not sure yet.',
        sourceType: 'social_post_copy',
      },
      { llmGenerate: mockLlm },
    );

    expect(analysis.classification).toBe('AMBIGUOUS');
    expect(analysis.outcome).toBe('AMBIGUOUS');
    expect(analysis.intents.primary).toBeNull();
    expect(analysis.has).toHaveLength(0);
    expect(analysis.wants).toHaveLength(0);
  });
});

describe('marketIntent G1 — cohort batch', () => {
  it('processes 32-signal cohort with mock LLM', async () => {
    const results = await ingestMarketSignalBatch(MARKET_SIGNAL_COHORT, { llmGenerate: mockLlm });
    expect(results).toHaveLength(32);

    const commercial = results.filter((r) => r.analysis.classification === 'COMMERCIAL');
    const nonCommercial = results.filter((r) => r.analysis.classification === 'NON_COMMERCIAL');
    expect(commercial.length).toBeGreaterThan(15);
    expect(nonCommercial.length).toBeGreaterThanOrEqual(2);

    const dup = results.find((r) => r.signal.signalId === 'cohort-012');
    expect(dup?.duplicateOfSignalId).toBe('cohort-001');
  });

  it('retains raw signal after processing failure path', async () => {
    const badLlm = async () => ({ text: 'not-json' });
    const { signal, analysis } = await ingestMarketSignal(
      {
        rawText: 'Some commercial text about distributors',
        sourceType: 'manual_entry',
      },
      { llmGenerate: badLlm },
    );
    expect(signal.rawText).toContain('distributors');
    expect(['AMBIGUOUS', 'CLASSIFICATION_FAILED']).toContain(analysis.outcome);
    expect(analysis.diagnostics.failureReason).toBeTruthy();
  });
});

describe('marketIntent G1 — multiple intents', () => {
  it('supports primary and secondary intents', async () => {
    const extracted = mockLlmResponseForText(
      'Chúng tôi là nhà sản xuất bao bì tại Việt Nam và đang tìm nhà phân phối tại Australia.',
    );
    expect(extracted.intents.length).toBeGreaterThanOrEqual(1);
    expect(extracted.intents[0]?.family).toBe('DISTRIBUTE');
  });
});

describe('marketIntent G1 — Vietnamese examples', () => {
  const viExamples = [
    'Mời hợp tác đầu tư',
    'Tìm đối tác phân phối',
    'Tìm đồng đội cùng phát triển',
    'Bên mình cần cộng tác viên bán hàng',
  ];

  for (const text of viExamples) {
    it(`classifies Vietnamese commercial text: ${text.slice(0, 30)}...`, async () => {
      const { analysis } = await ingestMarketSignal(
        { rawText: text, sourceType: 'social_post_copy' },
        { llmGenerate: mockLlm },
      );
      expect(analysis.classification).toBe('COMMERCIAL');
    });
  }
});
