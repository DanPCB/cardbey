/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { buildLoyaltyCardTopologyFromDetected } from '../loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from '../loyaltyRuleInference.js';
import {
  alignLegacyFieldsWithCanonicalRule,
  hasAuthoritativeLoyaltyTopology,
  summarizeLoyaltyContract,
} from '../loyaltyContractDiagnostics.js';
import { enrichLoyaltyDraftWithMatrixTopology } from '../loyaltyMatrixTopology.js';
import { buildLoyaltyProgramDraftData } from '../../toolExecutors/loyalty/loyaltyProgramDraft.js';
import { resolveLoyaltyPersistencePayload } from '../../toolExecutors/loyalty/loyaltyPersistencePayload.js';

function coffeeCardDetectedFixture() {
  const cells = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      cells.push({
        row,
        column: col,
        role: col < 7 ? 'PURCHASE' : 'REWARD',
        text: col < 7 ? 'Coffee' : 'Free',
        confidence: 0.95,
      });
    }
  }
  return {
    rows: 4,
    columns: 8,
    cells,
    repeatedPattern: {
      direction: 'ROW',
      roles: [...Array(7).fill('PURCHASE'), 'REWARD'],
      repetitions: 4,
      confidence: 0.95,
    },
    footerText: 'Catering Available',
    overallConfidence: 0.95,
  };
}

describe('loyalty contract pipeline — 4x8 coffee card', () => {
  it('builds authoritative topology with 28 purchase + 4 reward cells', () => {
    const topology = buildLoyaltyCardTopologyFromDetected(coffeeCardDetectedFixture(), {
      source: 'VISION_EXTRACTED',
    });
    expect(topology?.rows).toBe(4);
    expect(topology?.columns).toBe(8);
    expect(topology?.cells.filter((c) => c.role === 'PURCHASE')).toHaveLength(28);
    expect(topology?.cells.filter((c) => c.role === 'REWARD')).toHaveLength(4);
    expect(hasAuthoritativeLoyaltyTopology(topology)).toBe(true);

    const rule = inferRuleFromTopology(topology, {
      purchaseItem: 'Coffee',
      rewardItem: 'Free Coffee',
    });
    expect(rule?.purchasesRequired).toBe(7);
    expect(rule?.fixedCardCycles).toBe(4);

    const preseeded = alignLegacyFieldsWithCanonicalRule({
      rule,
      cardTopology: topology,
      cardFooterText: 'Catering Available',
      requiredStamps: 20,
      stampThreshold: 20,
      reward: 'Reward',
    });
    expect(preseeded.requiredStamps).toBe(7);
    expect(preseeded.stampThreshold).toBe(7);
    expect(preseeded.rewardRule).toMatch(/Collect 7 Coffee/);
  });

  it('does not let OCR matrix heuristic override vision topology', () => {
    const topology = buildLoyaltyCardTopologyFromDetected(coffeeCardDetectedFixture(), {
      source: 'VISION_EXTRACTED',
    });
    const rule = inferRuleFromTopology(topology, {
      purchaseItem: 'Coffee',
      rewardItem: 'Free Coffee',
    });
    const enriched = enrichLoyaltyDraftWithMatrixTopology(
      {
        rule,
        cardTopology: topology,
        matrix: { rows: 4, purchasesPerRow: 4, freePerRow: 1 },
        requiredStamps: 20,
      },
      { userMessage: '4x5+1free' },
    );
    expect(enriched.cardTopology?.columns).toBe(8);
    expect(enriched.rule?.purchasesRequired).toBe(7);
    expect(enriched.requiredStamps).toBe(7);
  });

  it('emits draft artifact with rule + topology and canonical threshold', () => {
    const topology = buildLoyaltyCardTopologyFromDetected(coffeeCardDetectedFixture(), {
      source: 'VISION_EXTRACTED',
    });
    const rule = inferRuleFromTopology(topology, {
      purchaseItem: 'Coffee',
      rewardItem: 'Free Coffee',
    });
    const draft = buildLoyaltyProgramDraftData({
      storeName: 'Bellamy Cafe',
      businessCategory: 'cafe',
      customerCount: 0,
      tiers: [],
      offers: [],
      preseededDraft: alignLegacyFieldsWithCanonicalRule({
        rule,
        cardTopology: topology,
        cardFooterText: 'Catering Available',
        requiredStamps: 20,
        reward: 'Reward',
        extractedFromImage: true,
      }),
    });
    expect(draft.rule?.purchasesRequired).toBe(7);
    expect(draft.cardTopology?.rows).toBe(4);
    expect(draft.requiredStamps).toBe(7);
    const summary = summarizeLoyaltyContract(draft, { boundary: 'loyalty_program_draft_artifact' });
    expect(summary.purchasesRequired).toBe(7);
    expect(summary.purchaseCells).toBe(28);
    expect(summary.rewardCells).toBe(4);
    expect(summary.rendererMode).toBe('TOPOLOGY_DRIVEN');
  });

  it('persists ruleJson and cardTopologyJson with canonical threshold', () => {
    const topology = buildLoyaltyCardTopologyFromDetected(coffeeCardDetectedFixture(), {
      source: 'VISION_EXTRACTED',
    });
    const rule = inferRuleFromTopology(topology, {
      purchaseItem: 'Coffee',
      rewardItem: 'Free Coffee',
    });
    const persisted = resolveLoyaltyPersistencePayload({
      programName: 'Bellamy Rewards',
      rule,
      cardTopology: topology,
      layoutSource: 'VISION_EXTRACTED',
      requiredStamps: 20,
      reward: 'Reward',
    });
    expect(persisted.stampsRequired).toBe(7);
    expect(persisted.ruleJson?.purchasesRequired).toBe(7);
    expect(persisted.cardTopologyJson?.rows).toBe(4);
    expect(persisted.layoutSource).toBe('VISION_EXTRACTED');
  });
});
