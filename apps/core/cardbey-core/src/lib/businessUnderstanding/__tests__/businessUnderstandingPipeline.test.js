/**
 * @vitest-environment node
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { classifyArtifact } from '../artifactClassifier.js';
import { extractLayoutContract } from '../layoutRecognition.js';
import { extractBusinessRuleContract } from '../businessRuleExtraction.js';
import { buildCanonicalContracts } from '../canonicalContracts.js';
import { buildMerchantUnderstandingSummary } from '../merchantUnderstandingSummary.js';
import { runBusinessUnderstandingPipeline } from '../businessUnderstandingPipeline.js';

vi.mock('../../../config/features.js', () => ({
  Features: {
    businessUnderstanding: {
      enabled: true,
      brandVision: false,
      telemetryLog: false,
    },
  },
}));

describe('artifactClassifier', () => {
  it('classifies loyalty card from visual hints', () => {
    const result = classifyArtifact({
      filename: 'card.png',
      mimeType: 'image/png',
      visualHints: ['stamp_grid', 'reward_program_candidate'],
    });
    expect(result.artifactType).toBe('loyalty_card');
    expect(result.confidence).toBeGreaterThan(0.7);
  });
});

describe('layoutRecognition', () => {
  it('extracts structure without business rules', () => {
    const layout = extractLayoutContract({
      cardTopology: {
        rows: 4,
        columns: 8,
        confidence: 0.9,
        footerText: 'Catering Available',
        cells: Array.from({ length: 32 }, (_, idx) => ({
          row: Math.floor(idx / 8),
          column: idx % 8,
          role: idx % 8 === 7 ? 'REWARD' : 'PURCHASE',
          label: idx % 8 === 7 ? 'Free' : 'Coffee',
        })),
      },
    });
    expect(layout?.schema).toBe('cb-layout');
    expect(layout?.rows).toBe(4);
    expect(layout?.columns).toBe(8);
    expect(layout?.purchaseCellCount).toBe(28);
    expect(layout?.rewardCellCount).toBe(4);
    expect(layout?.footerText?.value).toBe('Catering Available');
  });
});

describe('businessRuleExtraction', () => {
  it('maps loyalty rule to canonical earning/reward contract', () => {
    const rule = extractBusinessRuleContract({
      artifactType: 'loyalty_card',
      rule: {
        purchasesRequired: 7,
        purchaseItem: 'Coffee',
        rewardItem: 'Free',
        rewardQuantity: 1,
      },
    });
    expect(rule?.earningRule?.required).toBe(7);
    expect(rule?.earningRule?.item).toBe('coffee');
    expect(rule?.reward?.quantity).toBe(1);
  });
});

describe('businessUnderstandingPipeline', () => {
  it('produces separated canonical contracts and merchant summary', async () => {
    const result = await runBusinessUnderstandingPipeline({
      filename: 'loyalty.png',
      mimeType: 'image/png',
      visualHints: ['stamp_grid'],
      priorArtifactType: 'loyalty_card',
      storeName: 'My Cafe',
      preseededDraft: {
        programName: 'My Cafe Rewards',
        rule: {
          purchasesRequired: 7,
          purchaseItem: 'Coffee',
          rewardItem: 'Free',
          rewardQuantity: 1,
        },
        cardTopology: {
          rows: 4,
          columns: 8,
          confidence: 0.92,
          footerText: 'Catering Available',
          cells: Array.from({ length: 32 }, (_, idx) => ({
            row: Math.floor(idx / 8),
            column: idx % 8,
            role: idx % 8 === 7 ? 'REWARD' : 'PURCHASE',
          })),
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.bundle?.artifact.schema).toBe('cb-artifact');
    expect(result.bundle?.layout?.schema).toBe('cb-layout');
    expect(result.bundle?.businessRule?.schema).toBe('cb-business-rule');
    expect(result.bundle?.brand?.schema).toBe('cb-brand');
    expect(result.bundle?.intent?.schema).toBe('cb-intent');
    expect(result.merchantSummary?.readyForReview).toBe(true);
    expect(result.merchantSummary?.checkpoints.some((c) => c.ok && c.label.includes('Loyalty'))).toBe(
      true,
    );
  });
});

describe('canonicalContracts', () => {
  it('never merges contracts into a single blob', () => {
    const classification = classifyArtifact({
      visualHints: ['stamp_grid'],
      priorArtifactType: 'loyalty_card',
    });
    const bundle = buildCanonicalContracts({
      classification,
      layout: extractLayoutContract({
        cardTopology: { rows: 2, columns: 5, cells: [{ row: 0, column: 0, role: 'PURCHASE' }] },
      }),
      businessRule: extractBusinessRuleContract({
        artifactType: 'loyalty_card',
        rule: { purchasesRequired: 4, purchaseItem: 'Coffee', rewardItem: 'Free', rewardQuantity: 1 },
      }),
    });
    expect(bundle.artifact).toBeDefined();
    expect(bundle.layout).toBeDefined();
    expect(bundle.businessRule).toBeDefined();
    expect(bundle.artifact).not.toHaveProperty('cells');
  });
});
