/**
 * Pass 2 — Grounding invariant regressions (runtime G/F failure chain).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  classifyEvidenceKind,
  isAuthoritativeOffering,
  hasAuthoritativeOfferings,
  EVIDENCE_KIND,
} from '../../../services/draftStore/groundedStoreCreation.js';
import {
  canInventCatalogFacts,
  resolveGenerationGroundingPolicy,
  assignItemProvenance,
  invalidateItemDerivedMedia,
  clearCustomerFacingItemMedia,
  canUpgradeProvenance,
  GROUNDED_QA_OUTCOME,
} from '../../../services/draftStore/generationGroundingPolicy.js';
import { displayBusinessTypeForCopy } from '../../../services/draftStore/storeCreationAuthorityTrace.js';
import { buildAuthorityTraceFromPreview } from '../../../services/draftStore/storeCreationAuthorityTrace.js';
import {
  collectEvidenceOfferings,
  buildCatalogFromGroundedOfferings,
} from '../buildGroundedComposition.js';
import { buildCuisineMenuCatalog } from '../../../services/draftStore/foodCuisineCatalog.js';
import {
  applyDraftCatalogQaTier2Fixes,
  planDraftCatalogQaTier2Fixes,
} from '../../../services/qa/draftCatalogQa.js';

const HOURS = 'NOODLE hut Trading Hours Monday-Thursday 11.30 am';

describe('Pass2 grounding invariant', () => {
  const prevG = process.env.ENABLE_GROUNDED_STORE_CREATION_V1;
  beforeEach(() => {
    process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = 'true';
  });
  afterEach(() => {
    if (prevG === undefined) delete process.env.ENABLE_GROUNDED_STORE_CREATION_V1;
    else process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = prevG;
  });

  it('Test A — hours are not offerings', () => {
    expect(classifyEvidenceKind(HOURS)).toBe(EVIDENCE_KIND.OPENING_HOURS);
    expect(isAuthoritativeOffering(HOURS)).toBe(false);
    expect(
      hasAuthoritativeOfferings({
        groundedOfferings: [HOURS],
        seedItems: [{ name: HOURS }],
      }),
    ).toBe(false);
    expect(collectEvidenceOfferings({ ocrRawText: HOURS })).toEqual([]);
  });

  it('Test B — no grounded cuisine invention without menu evidence', () => {
    expect(buildCuisineMenuCatalog({ verticalSlug: 'food.asian' }, 12, { grounded: true })).toBeNull();
    const catalog = buildCatalogFromGroundedOfferings([HOURS], { draftId: 't' });
    expect(catalog.products).toHaveLength(0);
    expect(hasAuthoritativeOfferings({ mode: 'ai', groundedOfferings: [] })).toBe(false);
  });

  it('Test C — Tier2 cannot re-enter cuisine invention under grounded mode', () => {
    const preview = {
      storeName: 'NOODLE hut',
      storeType: 'Food & drink',
      items: [
        {
          id: 'i0',
          name: HOURS,
          description: '',
          price: null,
          origin: 'evidence',
          provenanceStatus: 'VERIFIED',
          imageUrl: 'https://images.pexels.com/photos/13729069/pexels-photo-13729069.jpeg',
          imageQuery: 'handyman noodle hut trading hours service',
        },
      ],
      categories: [{ id: 'c0', name: 'Offerings' }],
      meta: {
        groundedStoreCreation: true,
        generationPolicy: { mode: 'GROUNDED' },
        groundedComposition: { archetype: 'FOOD_TAKEAWAY', primaryCTA: 'Order Now' },
      },
      slogan: 'Welcome to NOODLE hut — quality Other you can trust.',
    };
    const policy = resolveGenerationGroundingPolicy({ preview, meta: preview.meta });
    expect(policy.canInventCatalogFacts).toBe(false);
    expect(canInventCatalogFacts({ preview })).toBe(false);

    const planned = planDraftCatalogQaTier2Fixes(preview, {}, { businessType: 'Food & drink', verticalSlug: 'food.asian' });
    const { preview: out, autoFixed } = applyDraftCatalogQaTier2Fixes(
      preview,
      { groundedComposition: preview.meta.groundedComposition },
      { businessType: 'Food & drink', verticalSlug: 'food.asian' },
      { fixIds: planned.map((f) => f.id).concat(['catalog_regenerate']) },
    );

    const names = (out.items || []).map((i) => i.name);
    expect(names).not.toContain('Edamame');
    expect(names.some((n) => /ramen|gyoza|pad thai/i.test(String(n)))).toBe(false);
    expect(autoFixed.some((x) => /removed_unsupported|grounded_qa_outcome/.test(x))).toBe(true);
    expect(out.meta?.groundedQaOutcome).toBe(GROUNDED_QA_OUTCOME.INCOMPLETE_MISSING_EVIDENCE);
    expect(out.items || []).toHaveLength(0);
  });

  it('Test D — provenance cannot be laundered', () => {
    const item = { name: 'Edamame', provenanceStatus: 'GENERATED_FALLBACK', origin: 'cuisine_bank' };
    assignItemProvenance(item, {
      provenanceStatus: 'VERIFIED',
      origin: 'evidence',
      catalogSource: 'grounded_evidence',
      hasEvidenceChain: false,
    });
    expect(item.provenanceStatus).toBe('GENERATED_FALLBACK');
    expect(item.origin).not.toBe('evidence');
    expect(canUpgradeProvenance('GENERATED_FALLBACK', 'VERIFIED')).toBe(false);
  });

  it('Test E — media invalidation on identity change', () => {
    const item = {
      name: HOURS,
      imageUrl: 'https://example.com/noodles.jpg',
      imageQuery: 'handyman trading hours',
      mediaMatchScore: 0.9,
    };
    invalidateItemDerivedMedia(item);
    expect(item.imageUrl).toBeNull();
    expect(item.imageQuery).toBeNull();
    expect(item.mediaStatus).toBe('needs_media');

    item.imageUrl = 'https://example.com/noodles.jpg';
    clearCustomerFacingItemMedia(item, 'weak_item_semantic_match');
    expect(item.imageUrl).toBeNull();
    expect(item.candidateImageUrl).toBeTruthy();
    expect(item.mediaStatus).toBe('needs_media');
  });

  it('Test F — Other suppression in public copy', () => {
    expect(displayBusinessTypeForCopy('Other', 'FOOD_TAKEAWAY')).not.toMatch(/^Other$/i);
    expect(displayBusinessTypeForCopy('Other', 'FOOD_TAKEAWAY')).toBe('food business');
    const leak = `Welcome to NOODLE hut — quality ${displayBusinessTypeForCopy('Other', 'FOOD_TAKEAWAY')} you can trust.`;
    expect(leak).not.toMatch(/quality Other/i);
  });

  it('Test G — authority trace on grounded preview', () => {
    const preview = {
      storeName: 'NOODLE hut',
      storeType: 'Food & drink',
      items: [],
      primaryCTA: 'Order Now',
      meta: {
        groundedStoreCreation: true,
        currencyCode: 'AUD',
        catalogSource: 'grounded_incomplete',
        offeringIncomplete: { reason: 'no_menu' },
        groundedComposition: { archetype: 'FOOD_TAKEAWAY', primaryCTA: 'Order Now' },
      },
    };
    const trace = buildAuthorityTraceFromPreview({
      preview,
      groundedComposition: preview.meta.groundedComposition,
      location: 'Fairfield VIC 3078',
      currencyCode: 'AUD',
    });
    expect(trace).toBeTruthy();
    expect(trace.groundingStatus).toBeTruthy();
    expect(trace.fields?.businessName?.value).toBe('NOODLE hut');
    expect(trace.fields?.CTA?.value).toBe('Order Now');
  });

  it('Final DTO boundary — hours → empty catalog, no Edamame, no Other, media cleared', () => {
    const preview = {
      storeName: 'NOODLE hut',
      storeType: 'Other',
      items: [
        {
          name: HOURS,
          provenanceStatus: 'VERIFIED',
          origin: 'evidence',
          imageUrl: 'https://images.pexels.com/photos/x.jpeg',
          imageQuery: 'trading hours',
        },
      ],
      slogan: 'Welcome to NOODLE hut — quality Other you can trust.',
      description: 'NOODLE hut is your local Other — browse our menu and order online.',
      meta: {
        groundedStoreCreation: true,
        generationPolicy: { mode: 'GROUNDED' },
        groundedComposition: { archetype: 'FOOD_TAKEAWAY', primaryCTA: 'Order Now' },
      },
    };
    const { preview: out } = applyDraftCatalogQaTier2Fixes(
      structuredClone(preview),
      { businessType: 'Other', groundedComposition: preview.meta.groundedComposition },
      { businessType: 'Other', verticalSlug: 'food.asian' },
      { fixIds: ['catalog_regenerate'] },
    );
    // Tier1-style Other repair via display helper (simulate post-QA copy path)
    const slogan = `Welcome to ${out.storeName} — quality ${displayBusinessTypeForCopy(
      out.storeType,
      out.meta?.groundedComposition?.archetype,
    )} you can trust.`;
    expect(out.items || []).toHaveLength(0);
    expect(JSON.stringify(out.items || [])).not.toMatch(/Edamame/i);
    expect(slogan).not.toMatch(/quality Other/i);
    const trace = buildAuthorityTraceFromPreview({
      preview: out,
      groundedComposition: out.meta?.groundedComposition,
    });
    expect(trace.groundingStatus).toBeTruthy();
  });
});
