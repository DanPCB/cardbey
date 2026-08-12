/**
 * Phase 3 resource grounding tests — needs come from composition; URI cannot change archetype.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { composeGroundedStoreIntelligence } from '../buildGroundedComposition.js';
import {
  flattenResourceNeeds,
  preferCandidateBySourcePriority,
  isAssetSuitableForNeed,
  createEmptyGroundedResourceBundle,
} from '../groundedResourceBundle.js';
import {
  resolveResourceNeedsToBundle,
  attachGroundedResourceBundleToPreview,
  collectOwnerProvidedCandidates,
  buildNeedSearchUtterance,
} from '../resolveGroundedResources.js';

const prevG = process.env.ENABLE_GROUNDED_STORE_CREATION_V1;
const prevR = process.env.ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1;

describe('Phase 3 grounded resource fulfillment', () => {
  beforeEach(() => {
    process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = 'true';
    process.env.ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1 = 'true';
  });
  afterEach(() => {
    if (prevG === undefined) delete process.env.ENABLE_GROUNDED_STORE_CREATION_V1;
    else process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = prevG;
    if (prevR === undefined) delete process.env.ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1;
    else process.env.ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1 = prevR;
  });

  it('resourceNeeds are produced from business understanding (not URI)', () => {
    const { plan } = composeGroundedStoreIntelligence({
      businessName: 'AWE Financial',
      category: 'Finance broker',
      detectedServices: ['Home loans', 'Refinancing'],
      primaryColor: '#0B1F3A',
    });
    expect(plan.archetype).toBe('FINANCIAL_SERVICE');
    expect(plan.resourceNeeds?.heroImageNeed).toBeTruthy();
    const slots = flattenResourceNeeds(plan.resourceNeeds);
    expect(slots.some((s) => s.purpose === 'hero')).toBe(true);
  });

  it('URI search receives explicit need utterance; archetype unchanged', async () => {
    const composition = composeGroundedStoreIntelligence({
      businessName: 'Harbour Plumbing',
      category: 'Plumbing',
      detectedServices: ['Blocked drains'],
    });
    const archetypeBefore = composition.plan.archetype;
    let sawUtterance = '';
    const bundle = await resolveResourceNeedsToBundle({
      composition: {
        ...composition.plan,
        resourceNeeds: composition.plan.resourceNeeds,
      },
      input: { businessName: 'Harbour Plumbing', category: 'Plumbing' },
      preview: { storeName: 'Harbour Plumbing', items: [] },
      searchFn: async (_prisma, input) => {
        sawUtterance = String(input.utterance || '');
        return {
          ok: true,
          candidates: [
            {
              score: 0.9,
              resource: {
                id: 'uri_1',
                sourceId: 'src_pexels',
                previewUrl: 'https://example.com/plumb.jpg',
                rightsSnapshot: { status: 'allow', decision: 'allow' },
              },
            },
          ],
        };
      },
    });
    expect(archetypeBefore).toBe('HOME_SERVICE');
    expect(composition.plan.archetype).toBe(archetypeBefore);
    expect(sawUtterance.toLowerCase()).toMatch(/hero|service|home|plumb|practical|utilitarian|harbour/i);
    expect(bundle.resources.some((r) => r.status === 'filled')).toBe(true);
  });

  it('owner asset wins over equivalent external asset', async () => {
    const bundle = await resolveResourceNeedsToBundle({
      resourceNeeds: {
        heroImageNeed: { purpose: 'hero', subjectHints: ['storefront'], negativeHints: [] },
      },
      composition: { archetype: 'RETAIL' },
      input: {},
      preview: {
        heroImageUrl: 'https://owner.example/hero.jpg',
        meta: { heroImageSource: 'owner' },
        items: [],
      },
      searchFn: async () => ({
        ok: true,
        candidates: [
          {
            score: 0.99,
            resource: {
              id: 'uri_strong',
              sourceId: 'src_pexels',
              previewUrl: 'https://stock.example/pretty.jpg',
              rightsSnapshot: { decision: 'allow' },
            },
          },
        ],
      }),
    });
    const hero = bundle.resources.find((r) => r.needId === 'hero');
    expect(hero.status).toBe('filled');
    expect(hero.sourceTier).toBe('owner_provided');
    expect(hero.url).toContain('owner.example');
  });

  it('rights-unsafe resource rejected → needs_media when no owner', async () => {
    const bundle = await resolveResourceNeedsToBundle({
      resourceNeeds: {
        heroImageNeed: { purpose: 'hero', subjectHints: ['cafe'], negativeHints: [] },
      },
      composition: { archetype: 'CAFE' },
      input: {},
      preview: { items: [] },
      searchFn: async () => ({
        ok: true,
        candidates: [
          {
            score: 0.95,
            resource: {
              id: 'bad',
              sourceId: 'src_pexels',
              previewUrl: 'https://stock.example/x.jpg',
              rightsSnapshot: { decision: 'deny' },
            },
          },
        ],
      }),
    });
    const hero = bundle.resources.find((r) => r.needId === 'hero');
    expect(hero.status).toBe('needs_media');
    expect(bundle.unresolvedNeeds).toContain('hero');
  });

  it('business-card scan is not automatically used as hero imagery', async () => {
    const card = `data:image/png;base64,${'C'.repeat(80)}`;
    const owners = collectOwnerProvidedCandidates({
      input: { imageDataUrl: card, businessName: 'Noodle Hut' },
      preview: { items: [] },
    });
    expect(owners.some((o) => o.isDocumentScan)).toBe(true);
    expect(
      isAssetSuitableForNeed({ purpose: 'hero' }, { isDocumentScan: true }),
    ).toBe(false);

    const bundle = await resolveResourceNeedsToBundle({
      resourceNeeds: {
        heroImageNeed: { purpose: 'hero', subjectHints: ['food'], negativeHints: [] },
      },
      composition: { archetype: 'FOOD_TAKEAWAY' },
      input: { imageDataUrl: card },
      preview: { items: [] },
      searchFn: async () => ({ ok: true, candidates: [] }),
    });
    const hero = bundle.resources.find((r) => r.needId === 'hero');
    expect(hero.status).toBe('needs_media');
    expect(hero.url).toBeNull();
  });

  it('preferCandidateBySourcePriority keeps owner over uri', () => {
    const winner = preferCandidateBySourcePriority(
      { sourceTier: 'uri_external', confidence: 0.99 },
      { sourceTier: 'owner_provided', confidence: 0.5 },
    );
    expect(winner.sourceTier).toBe('owner_provided');
  });

  it('attachGroundedResourceBundleToPreview assembles without inventing offerings', () => {
    const preview = {
      storeName: 'Test',
      items: [{ id: '1', name: 'Home loans', imageUrl: null }],
    };
    const bundle = createEmptyGroundedResourceBundle({
      archetype: 'FINANCIAL_SERVICE',
      resources: [
        {
          needId: 'hero',
          purpose: 'hero',
          status: 'filled',
          url: 'https://cdn.example/hero.jpg',
          resourceRef: 'r1',
          sourceTier: 'universal_library',
          provenance: {},
          rights: { decision: 'allow' },
          confidence: 0.8,
          rejectedReasons: [],
        },
        {
          needId: 'service_0',
          purpose: 'service',
          status: 'filled',
          url: 'https://cdn.example/svc.jpg',
          resourceRef: 'r2',
          sourceTier: 'uri_external',
          provenance: {},
          rights: { decision: 'allow' },
          confidence: 0.7,
          rejectedReasons: [],
        },
      ],
      unresolvedNeeds: [],
      diagnostics: { filled: 2 },
    });
    attachGroundedResourceBundleToPreview(preview, bundle);
    expect(preview.heroImageUrl).toContain('hero.jpg');
    expect(preview.items[0].imageUrl).toContain('svc.jpg');
    expect(preview.items[0].name).toBe('Home loans');
    expect(preview.meta.groundedResourceBundle.archetype).toBe('FINANCIAL_SERVICE');
  });

  it('buildNeedSearchUtterance does not invent retail for finance', () => {
    const u = buildNeedSearchUtterance(
      { purpose: 'hero', subjectHints: ['trust'], negativeHints: ['food', 'beauty'] },
      { archetype: 'FINANCIAL_SERVICE', businessName: 'AWE Financial' },
    );
    expect(u.toLowerCase()).toMatch(/financial|trust|awe/);
    expect(u.toLowerCase()).toMatch(/avoid.*food/);
    expect(u.toLowerCase()).not.toMatch(/shop now|add to cart/);
  });

  it('flag OFF path: resource grounding helper still pure without changing composition', () => {
    process.env.ENABLE_RESOURCE_GROUNDED_STORE_GENERATION_V1 = 'false';
    const { plan } = composeGroundedStoreIntelligence({
      businessName: 'Country Cafe',
      category: 'Cafe',
      ocrRawText: 'Eggs Benedict\nFlat White',
    });
    expect(plan.archetype).toBe('CAFE');
    expect(plan.resourceNeeds).toBeTruthy();
  });
});
