/**
 * Phase 2 pilot matrix — six materially different businesses through
 * Evidence → Understanding → Composition → Theme → Website sections.
 * Does not hit DB / OpenAI; proves composition divergence under the flag path.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  composeGroundedStoreIntelligence,
  applyCompositionToGenerationParams,
  collectEvidenceOfferings,
  toDisplayReadyCopy,
} from '../buildGroundedComposition.js';
import { mergeWebsiteIntoPreview } from '../../../services/draftStore/websiteSectionsGenerator.js';

const PILOT_CASES = [
  {
    id: 'finance_broker',
    label: 'Finance broker',
    evidenceMode: 'prompt_rich',
    input: {
      businessName: 'AWE Financial',
      category: 'Finance broker',
      businessType: 'mortgage broker',
      prompt: 'Home loans and refinancing advice',
      detectedServices: [
        'Home loans',
        'Debt consolidation',
        'Low-doc loans',
        'Property investment',
        'Refinancing',
      ],
      primaryColor: '#0B1F3A',
      secondaryColor: '#1B4F8A',
      phone: '1300 000 111',
      location: 'Sydney NSW',
    },
    expectArchetype: 'FINANCIAL_SERVICE',
    expectCta: /consultation|enquiry|options/i,
    forbidCta: /add to cart|shop now/i,
    expectOfferings: ['Home loans', 'Debt consolidation'],
    expectThemePrimary: '#0B1F3A',
    expectOfferingPresentation: 'service_list',
  },
  {
    id: 'cafe',
    label: 'Cafe',
    evidenceMode: 'ocr_upload',
    input: {
      businessName: 'Country Cafe',
      category: 'Cafe',
      ocrRawText: [
        'COUNTRY CAFE',
        'Eggs Your Way  $14',
        'Eggs Benedict  $18',
        'Spicy Chorizo & Eggs  $19',
        'Smashed Avo  $16',
        'Flat White  $5',
        'Open daily 7am–3pm',
        '12 Main St',
      ].join('\n'),
      primaryColor: '#5C4033',
      location: 'Byron Bay',
      hours: 'Open daily 7am–3pm',
    },
    expectArchetype: 'CAFE',
    expectCta: /menu|order|directions/i,
    forbidCta: /add to cart|consultation/i,
    expectOfferings: ['Eggs Your Way', 'Eggs Benedict', 'Smashed Avo'],
    forbidOfferings: [/basic package/i, /premium package/i],
    expectThemePrimary: '#5C4033',
    expectOfferingPresentation: 'menu',
  },
  {
    id: 'takeaway',
    label: 'Takeaway restaurant',
    evidenceMode: 'ocr_upload',
    input: {
      businessName: 'Noodle Hut',
      category: 'Takeaway',
      businessType: 'noodle takeaway',
      ocrRawText: [
        'NOODLE HUT',
        'Beef Pho  $16',
        'Chicken Laksa  $15',
        'Pad Thai  $14',
        'Spring Rolls  $8',
        'Orange + black brand',
      ].join('\n'),
      primaryColor: '#E85D04',
      secondaryColor: '#111111',
    },
    expectArchetype: 'FOOD_TAKEAWAY',
    expectCta: /order|menu/i,
    forbidCta: /add to cart|book a consultation/i,
    expectOfferings: ['Beef Pho', 'Pad Thai'],
    expectThemePrimary: '#E85D04',
    expectOfferingPresentation: 'menu',
  },
  {
    id: 'home_service',
    label: 'Home/trade service',
    evidenceMode: 'prompt_led',
    input: {
      businessName: 'Harbour Plumbing',
      category: 'Plumbing',
      businessType: 'home plumbing service',
      prompt: 'Blocked drains, hot water, bathroom installs. Request a quote.',
      detectedServices: ['Blocked drains', 'Hot water systems', 'Bathroom plumbing', 'Emergency call-out'],
      location: 'Inner West Sydney',
    },
    expectArchetype: 'HOME_SERVICE',
    expectCta: /quote|call/i,
    forbidCta: /add to cart|shop now|order now/i,
    expectOfferings: ['Blocked drains', 'Hot water systems'],
    expectOfferingPresentation: 'service_list',
  },
  {
    id: 'beauty',
    label: 'Beauty/hair',
    evidenceMode: 'sparse',
    input: {
      businessName: 'Luna Hair Studio',
      category: 'Hair salon',
      businessType: 'beauty salon',
      // sparse: name + category only — no invented package catalog expected
    },
    expectArchetype: 'APPOINTMENT_SERVICE',
    expectCta: /book|services/i,
    forbidCta: /add to cart|shop now/i,
    expectOfferingsMax: 0,
    expectOfferingPresentation: 'service_list',
  },
  {
    id: 'retail',
    label: 'Product retailer',
    evidenceMode: 'prompt_rich',
    input: {
      businessName: 'Northside Outfitters',
      category: 'Retail fashion',
      businessType: 'clothing boutique',
      products: ['Linen Shirt', 'Canvas Tote', 'Wool Beanie', 'Everyday Sneakers'],
      primaryColor: '#111827',
    },
    expectArchetype: 'RETAIL',
    expectCta: /shop|products/i,
    forbidCta: /consultation|request a quote/i,
    expectOfferings: ['Linen Shirt', 'Canvas Tote'],
    expectThemePrimary: '#111827',
    expectOfferingPresentation: 'product_grid',
  },
];

describe('Phase 2 business-aware store generation pilot matrix', () => {
  /** @type {Array<Record<string, unknown>>} */
  const fingerprints = [];

  afterEach(() => {
    /* fingerprints accumulated across cases in parent suite */
  });

  it.each(PILOT_CASES)(
    '$label — distinct composition from evidence',
    (pilot) => {
      const composition = composeGroundedStoreIntelligence(pilot.input);
      const { plan, brand, groundedOfferings, gate, understanding } = composition;

      expect(plan.archetype).toBe(pilot.expectArchetype);
      expect(understanding.archetype).toBe(pilot.expectArchetype);
      expect(String(plan.primaryCTA)).toMatch(pilot.expectCta);
      expect(String(plan.primaryCTA)).not.toMatch(pilot.forbidCta);

      if (pilot.expectOfferings) {
        for (const name of pilot.expectOfferings) {
          expect(groundedOfferings).toContain(name);
        }
      }
      if (pilot.forbidOfferings) {
        for (const re of pilot.forbidOfferings) {
          expect(groundedOfferings.some((o) => re.test(o))).toBe(false);
        }
      }
      if (typeof pilot.expectOfferingsMax === 'number') {
        expect(groundedOfferings.length).toBeLessThanOrEqual(pilot.expectOfferingsMax);
      }

      expect(plan.offeringPresentation).toBe(pilot.expectOfferingPresentation);
      if (pilot.expectThemePrimary) {
        expect(plan.themeSpec?.primary).toBe(pilot.expectThemePrimary);
      }

      expect(gate.ok).toBe(true);
      expect(plan.resourceNeeds?.heroImageNeed).toBeTruthy();

      // Apply onto generation params (seed force when offerings exist)
      const params = { mode: 'ai', businessName: pilot.input.businessName };
      applyCompositionToGenerationParams(params, composition);
      expect(params.groundedComposition.archetype).toBe(pilot.expectArchetype);
      if (groundedOfferings.length > 0) {
        expect(params.mode).toBe('seed');
        expect(params.groundedForcedSeedFromEvidence).toBe(true);
        expect(params.seedItems.length).toBe(groundedOfferings.length);
      }

      // Website sections diverge by archetype (no universal fake reviews)
      const preview = {
        storeName: pilot.input.businessName,
        storeType: pilot.input.category || pilot.input.businessType,
        slogan: 'Suggested tagline: Welcome to excellence',
        items: groundedOfferings.map((name, i) => ({ id: `i${i}`, name })),
        primaryCTA: 'Add to Cart',
      };
      mergeWebsiteIntoPreview(preview, {
        ...pilot.input,
        groundedComposition: params.groundedComposition,
      });

      const sectionTypes = (preview.website?.sections || []).map((s) => s.type);
      expect(sectionTypes[0]).toBe('hero');
      expect(sectionTypes).toContain('contact');
      expect(preview.primaryCTA).toMatch(pilot.expectCta);
      expect(preview.website.sections.find((s) => s.type === 'hero')?.content?.ctaLabel).toMatch(
        pilot.expectCta,
      );
      // Sanitized slogan — no meta-instruction leakage
      const heroSub = preview.website.sections.find((s) => s.type === 'hero')?.content?.subheadline;
      expect(String(heroSub)).not.toMatch(/suggested tagline/i);
      expect(toDisplayReadyCopy('Suggested tagline: Welcome to excellence')).toBe(
        'Welcome to excellence',
      );

      if (pilot.expectArchetype !== 'RETAIL' && pilot.expectArchetype !== 'ECOMMERCE') {
        const reviews = preview.website.sections.find((s) => s.type === 'social_proof');
        expect(reviews == null || (reviews.content?.reviews || []).length === 0).toBe(true);
      }

      if (pilot.expectThemePrimary) {
        expect(preview.website.theme?.primary || preview.website.theme?.primaryColor).toBe(
          pilot.expectThemePrimary,
        );
      }

      fingerprints.push({
        id: pilot.id,
        label: pilot.label,
        evidenceMode: pilot.evidenceMode,
        archetype: plan.archetype,
        primaryCTA: plan.primaryCTA,
        secondaryCTA: plan.secondaryCTA,
        sectionPriority: plan.sectionPriority,
        websiteSectionTypes: plan.websiteSectionTypes,
        offeringPresentation: plan.offeringPresentation,
        offerings: groundedOfferings,
        themePrimary: plan.themeSpec?.primary,
        themeTone: brand.tone,
        gate: gate.reasons,
        renderedSections: sectionTypes,
        resourceNeedsKeys: Object.keys(plan.resourceNeeds || {}),
      });
    },
  );

  it('six pilots are mutually distinguishable without business names', () => {
    const compositions = PILOT_CASES.map((p) => composeGroundedStoreIntelligence(p.input));
    const signatures = compositions.map((c) =>
      [
        c.plan.archetype,
        c.plan.primaryCTA,
        c.plan.offeringPresentation,
        (c.plan.sectionPriority || []).slice(0, 4).join('|'),
        c.plan.themeSpec?.primary || '',
        c.brand.tone || '',
      ].join('::'),
    );
    const unique = new Set(signatures);
    expect(unique.size).toBe(PILOT_CASES.length);

    // Name-swap test: finance layout must not equal cafe layout
    const finance = compositions[0].plan;
    const cafe = compositions[1].plan;
    expect(finance.sectionPriority.join()).not.toBe(cafe.sectionPriority.join());
    expect(finance.primaryCTA).not.toBe(cafe.primaryCTA);
    expect(finance.offeringPresentation).not.toBe(cafe.offeringPresentation);
  });

  it('does not invent Basic/Premium packages when OCR offerings exist', () => {
    const offerings = collectEvidenceOfferings({
      ocrRawText: 'Eggs Benedict\nSmashed Avo\nFlat White',
      businessName: 'Country Cafe',
      category: 'Cafe',
    });
    expect(offerings).toEqual(expect.arrayContaining(['Eggs Benedict', 'Smashed Avo', 'Flat White']));
    expect(offerings.some((o) => /package/i.test(o))).toBe(false);
  });
});

describe('Phase 2 flag-off / legacy website path', () => {
  const prev = process.env.ENABLE_GROUNDED_STORE_CREATION_V1;

  afterEach(() => {
    if (prev === undefined) delete process.env.ENABLE_GROUNDED_STORE_CREATION_V1;
    else process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = prev;
  });

  it('mergeWebsiteIntoPreview without groundedComposition keeps legacy generic sections', () => {
    process.env.ENABLE_GROUNDED_STORE_CREATION_V1 = 'false';
    const preview = {
      storeName: 'Any Biz',
      storeType: 'Store',
      items: [{ id: 'a', name: 'Item' }],
    };
    mergeWebsiteIntoPreview(preview, { businessDescription: 'Hello' });
    const types = preview.website.sections.map((s) => s.type);
    expect(types).toContain('usp_bar');
    expect(types).toContain('social_proof');
    expect(types).toContain('about');
    expect(types).toContain('contact');
    // Legacy fabricated reviews still present when grounded composition absent
    const proof = preview.website.sections.find((s) => s.type === 'social_proof');
    expect((proof?.content?.reviews || []).length).toBeGreaterThan(0);
  });
});
