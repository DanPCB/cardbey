/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import { runPerformerGrounding } from '../performerGroundingEngine.js';
import { buildBusinessContentEvidenceFromResearch } from '../adapters/storeGroundingAdapter.js';

describe('performerGroundingEngine end-to-end', () => {
  it('uploaded 11-service menu preserves sections, order, and count', () => {
    const items = Array.from({ length: 11 }, (_, i) => ({
      name: `Service ${i + 1}`,
      description: `Desc ${i + 1}`,
      price: 40 + i,
      category: i < 6 ? 'Haircuts' : 'Colour',
      confidence: 0.9,
      sourceType: 'uploaded_document',
    }));

    const evidence = buildBusinessContentEvidenceFromResearch({
      facts: {
        businessName: { value: 'Studio Nine', sourceType: 'manual', confidence: 0.9 },
      },
      items,
      input: { businessName: 'Studio Nine', missionId: 'm_1', userId: 'u_1' },
      businessKind: 'services',
      confidence: 0.9,
    });

    const result = runPerformerGrounding({
      intent: { family: 'STORE_CREATION' },
      intentFamily: 'store_creation',
      evidence,
      missionId: 'm_1',
    });

    expect(result.catalogDraft?.counts.total).toBe(11);
    expect(result.catalogDraft?.sections.length).toBe(2);
    expect(result.catalogDraft?.sections[0].title).toBe('Haircuts');
    expect(result.catalogDraft?.sections[0].items).toHaveLength(6);
    expect(result.legacyCatalog?.products).toHaveLength(11);
    expect(result.legacyCatalog?.meta?.evidenceAuthoritative).toBe(true);
    expect(result.legacyCatalog?.meta?.canonicalItemCount).toBe(11);
    expect(result.requiresOwnerReview).toBe(false);
  });
});
