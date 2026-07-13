/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { buildLoyaltyCardTopologyFromDetected } from '../loyaltyTopologyBuild.js';
import { inferRuleFromTopology } from '../loyaltyRuleInference.js';
import { alignLegacyFieldsWithCanonicalRule } from '../loyaltyContractDiagnostics.js';
import {
  applyOwnerActionToCreationContract,
  buildLoyaltyCreationContract,
  loyaltyCreationContractToDraft,
} from '../loyaltyCreationContract.js';
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

function coffeePreseeded() {
  const topology = buildLoyaltyCardTopologyFromDetected(coffeeCardDetectedFixture(), {
    source: 'VISION_EXTRACTED',
  });
  const rule = inferRuleFromTopology(topology, {
    purchaseItem: 'Coffee',
    rewardItem: 'Free Coffee',
  });
  return alignLegacyFieldsWithCanonicalRule({
    rule,
    cardTopology: topology,
    cardFooterText: 'Catering Available',
    requiredStamps: 20,
    stampThreshold: 20,
    reward: 'Reward',
    extractedFromImage: true,
    confidence: 0.95,
    imageAssetId: 'asset-coffee-1',
  });
}

const nailsStoreContext = {
  storeName: 'Gloss Nails',
  businessCategory: 'nail salon',
  products: [
    { id: 'svc-gel', name: 'Gel Manicure', itemType: 'service', price: 55 },
    { id: 'svc-classic', name: 'Classic Pedicure', itemType: 'service', price: 45 },
    { id: 'svc-art', name: 'Nail Art Add-on', itemType: 'service', price: 25 },
  ],
  customerCount: 120,
};

function persistenceKeys(draft) {
  const payload = resolveLoyaltyPersistencePayload({
    ...draft,
    programName: draft.programName ?? 'Rewards',
  });
  return Object.keys(payload).sort();
}

describe('unified loyalty creation contract', () => {
  it('1b. missionEvidenceGraph topology merges when preseeded lacks authoritative layout', () => {
    const graphTopology = buildLoyaltyCardTopologyFromDetected(coffeeCardDetectedFixture(), {
      source: 'FUSION_VISUAL_OCR',
    });
    const contract = buildLoyaltyCreationContract({
      storeId: 'store-coffee',
      hasAttachmentEvidence: true,
      preseededDraft: {
        reward: 'Reward perk',
        requiredStamps: 8,
        stampThreshold: 8,
        extractedFromImage: true,
      },
      storeContext: { storeName: 'My Cafe', businessCategory: 'cafe' },
      missionEvidenceGraph: {
        nodes: [],
        decisions: [],
        conflicts: [],
        topology: graphTopology,
        rule: inferRuleFromTopology(graphTopology, {
          purchaseItem: 'Coffee',
          rewardItem: 'Reward perk',
        }),
      },
    });
    expect(contract.cardTopology?.rows).toBe(4);
    expect(contract.cardTopology?.columns).toBe(8);
    expect(contract.provenance.topologySource).toBe('FUSION_VISUAL_OCR');
    expect(contract.rendererMode).toBe('TOPOLOGY_DRIVEN');
  });

  it('1. physical coffee card → SOURCE_DRIVEN', () => {
    const preseeded = coffeePreseeded();
    const contract = buildLoyaltyCreationContract({
      storeId: 'store-coffee',
      hasAttachmentEvidence: true,
      preseededDraft: preseeded,
      storeContext: { storeName: 'Bellamy Cafe', businessCategory: 'cafe' },
    });

    expect(contract.sourceMode).toBe('SOURCE_DRIVEN');
    expect(contract.rule?.purchasesRequired).toBe(7);
    expect(contract.cardTopology?.rows).toBe(4);
    expect(contract.cardTopology?.columns).toBe(8);
    expect(contract.provenance.ruleSource).toBe('SOURCE_EXTRACTED');
    expect(contract.provenance.topologySource).toBe('VISION_EXTRACTED');
    expect(contract.sourceEvidence?.assetRef).toBe('asset-coffee-1');
    expect(contract.requiresOwnerReview).toBe(true);
  });

  it('2. nails-shop text request → INTENT_DRIVEN with catalog-based recommendations', () => {
    const contract = buildLoyaltyCreationContract({
      storeId: 'store-nails',
      userMessage: 'Help me create a loyalty program for my nails shop.',
      storeContext: nailsStoreContext,
    });

    expect(contract.sourceMode).toBe('INTENT_DRIVEN');
    expect(contract.recommendations?.length).toBeGreaterThanOrEqual(2);
    expect(contract.recommendations?.length).toBeLessThanOrEqual(4);
    const refs = contract.recommendations?.flatMap((r) => r.basedOnCatalogRefs) ?? [];
    expect(refs).toContain('svc-gel');
    expect(contract.recommendationContext?.businessCategory).toBe('nail salon');
    expect(contract.rule?.purchaseItem).toMatch(/Gel Manicure|eligible/i);
    expect(contract.provenance.ruleSource).toBe('AI_RECOMMENDED');
  });

  it('3. uploaded card plus improvement request → HYBRID', () => {
    const preseeded = coffeePreseeded();
    const contract = buildLoyaltyCreationContract({
      storeId: 'store-hybrid',
      hasAttachmentEvidence: true,
      userMessage: 'Use this old card but make a better program.',
      preseededDraft: preseeded,
      storeContext: nailsStoreContext,
    });

    expect(contract.sourceMode).toBe('HYBRID');
    expect(contract.hybridContext?.originalRule?.purchasesRequired).toBe(7);
    expect(contract.hybridContext?.originalTopology?.rows).toBe(4);
    expect(contract.recommendations?.length).toBeGreaterThan(0);
    expect(contract.hybridContext?.proposedRule).toBeTruthy();
  });

  it('4. source-extracted rule outranks legacy 10/20-stamp defaults', () => {
    const preseeded = coffeePreseeded();
    const contract = buildLoyaltyCreationContract({
      storeId: 'store-coffee',
      hasAttachmentEvidence: true,
      preseededDraft: preseeded,
    });
    const draft = loyaltyCreationContractToDraft(contract);

    expect(contract.rule?.purchasesRequired).toBe(7);
    expect(draft.requiredStamps).toBe(7);
    expect(draft.stampThreshold).toBe(7);
    expect(draft.requiredStamps).not.toBe(20);
  });

  it('5. intent-driven mode works with optional topology (DEFAULT_TEMPLATE provenance)', () => {
    const contract = buildLoyaltyCreationContract({
      storeId: 'store-nails',
      userMessage: 'Create loyalty for my salon',
      storeContext: nailsStoreContext,
    });

    expect(contract.sourceMode).toBe('INTENT_DRIVEN');
    expect(['DEFAULT_TEMPLATE', 'OWNER_DEFINED', 'NONE']).toContain(contract.provenance.topologySource);
    const draft = loyaltyCreationContractToDraft(contract);
    expect(draft.creationContract?.sourceMode).toBe('INTENT_DRIVEN');
  });

  it('6. intent-driven recommendations use actual store services', () => {
    const contract = buildLoyaltyCreationContract({
      storeId: 'store-nails',
      userMessage: 'loyalty program for nails shop',
      storeContext: nailsStoreContext,
    });

    const titles = (contract.recommendations ?? []).map((r) => r.title).join(' ');
    expect(titles).toMatch(/Gel Manicure|eligible service|Spend/i);
    const suggestionOnly = contract.recommendations?.filter((r) => r.suggestionOnly);
    expect(suggestionOnly?.length ?? 0).toBeGreaterThanOrEqual(0);
    for (const rec of contract.recommendations ?? []) {
      if (rec.basedOnCatalogRefs.length > 0) {
        expect(rec.basedOnCatalogRefs.some((ref) => ref.startsWith('svc-'))).toBe(true);
      }
    }
  });

  it('7. owner edit changes provenance to OWNER_DEFINED', () => {
    const contract = buildLoyaltyCreationContract({
      storeId: 'store-nails',
      userMessage: 'loyalty for nails',
      storeContext: nailsStoreContext,
    });

    const editedRule = {
      ...contract.rule,
      purchasesRequired: 8,
      rewardItem: 'Free Gel Manicure',
    };

    const updated = applyOwnerActionToCreationContract(contract, 'EDIT', {
      rule: editedRule,
    });

    expect(updated.provenance.ruleSource).toBe('OWNER_DEFINED');
    expect(updated.rule?.purchasesRequired).toBe(8);
    expect(updated.rule?.rewardItem).toBe('Free Gel Manicure');
  });

  it('8. all modes produce the same canonical persistence contract shape', () => {
    const source = loyaltyCreationContractToDraft(
      buildLoyaltyCreationContract({
        storeId: 'store-1',
        hasAttachmentEvidence: true,
        preseededDraft: coffeePreseeded(),
      }),
    );
    const intent = loyaltyCreationContractToDraft(
      buildLoyaltyCreationContract({
        storeId: 'store-1',
        userMessage: 'create loyalty',
        storeContext: nailsStoreContext,
      }),
    );
    const hybrid = loyaltyCreationContractToDraft(
      buildLoyaltyCreationContract({
        storeId: 'store-1',
        hasAttachmentEvidence: true,
        userMessage: 'improve this card',
        preseededDraft: coffeePreseeded(),
        storeContext: nailsStoreContext,
      }),
    );

    const sourceKeys = persistenceKeys(source);
    const intentKeys = persistenceKeys(intent);
    const hybridKeys = persistenceKeys(hybrid);

    expect(sourceKeys).toEqual(intentKeys);
    expect(intentKeys).toEqual(hybridKeys);
    for (const draft of [source, intent, hybrid]) {
      expect(draft.creationContract).toBeTruthy();
      expect(draft.sourceMode).toBeTruthy();
      expect(draft.rule?.programType).toBe('STAMP_CARD');
    }
  });

  it('9. published customer view payload supports topology and non-topology programs', () => {
    const withTopology = loyaltyCreationContractToDraft(
      buildLoyaltyCreationContract({
        storeId: 'store-1',
        hasAttachmentEvidence: true,
        preseededDraft: coffeePreseeded(),
      }),
    );
    const withoutTopology = loyaltyCreationContractToDraft(
      buildLoyaltyCreationContract({
        storeId: 'store-1',
        userMessage: 'simple loyalty',
        storeContext: { ...nailsStoreContext, products: [] },
      }),
    );

    const topoPayload = resolveLoyaltyPersistencePayload({
      ...withTopology,
      programName: 'Coffee Rewards',
    });
    const plainPayload = resolveLoyaltyPersistencePayload({
      ...withoutTopology,
      programName: 'Salon Rewards',
    });

    expect(topoPayload.cardTopologyJson?.rows).toBe(4);
    expect(topoPayload.ruleJson?.purchasesRequired).toBe(7);
    expect(plainPayload.ruleJson?.purchasesRequired).toBeGreaterThan(0);
    expect(plainPayload.name).toBe('Salon Rewards');
  });

  it('10. no generic 10/20-stamp fallback overrides valid source or owner choices', () => {
    const preseeded = coffeePreseeded();
    const contract = buildLoyaltyCreationContract({
      storeId: 'store-coffee',
      hasAttachmentEvidence: true,
      preseededDraft: preseeded,
    });

    const approved = applyOwnerActionToCreationContract(contract, 'APPROVE', {
      rule: contract.rule,
      cardTopology: contract.cardTopology,
    });
    const draft = loyaltyCreationContractToDraft(approved);

    expect(draft.requiredStamps).toBe(7);
    expect(draft.stampThreshold).toBe(7);
    expect(draft.rule?.purchasesRequired).toBe(7);
    expect(draft.requiredStamps).not.toBe(10);
    expect(draft.requiredStamps).not.toBe(20);
  });
});
