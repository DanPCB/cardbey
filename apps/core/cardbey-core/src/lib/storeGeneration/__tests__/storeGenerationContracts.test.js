import { describe, expect, it } from 'vitest';
import {
  storeField,
  isFactuallyTrusted,
  createEmptyEvidenceBundle,
  addExtractedFact,
  addVisualSignal,
  createEmptyBusinessUnderstanding,
  toDisplayReadyCopy,
  createEmptyBrandStyleProfile,
  resolveThemePriorityTier,
  inferArchetypeFromHints,
  getArchetypeDefaults,
  buildStoreCompositionPlan,
  evaluateCompositionGenericness,
} from '../index.js';

describe('storeGeneration contracts (Phase 1)', () => {
  it('keeps suggested fields untrusted as facts', () => {
    const suggested = storeField('Premium Package', { status: 'SUGGESTED' });
    const verified = storeField('Home Loans', {
      status: 'VERIFIED',
      sourceType: 'uploaded_flyer',
      confidence: 0.9,
    });
    expect(isFactuallyTrusted(suggested)).toBe(false);
    expect(isFactuallyTrusted(verified)).toBe(true);
  });

  it('separates OCR facts from visual signals in EvidenceBundle', () => {
    const bundle = createEmptyEvidenceBundle();
    addExtractedFact(bundle, 'businessName', 'Country Cafe', {
      sourceType: 'uploaded_flyer',
      status: 'VERIFIED',
      confidence: 0.95,
    });
    addVisualSignal(bundle, 'primaryColor', '#5C4033', {
      sourceType: 'vision',
      status: 'INFERRED',
      confidence: 0.7,
    });
    expect(bundle.extractedFacts).toHaveLength(1);
    expect(bundle.visualSignals).toHaveLength(1);
    expect(bundle.extractedFacts[0].key).toBe('businessName');
    expect(bundle.visualSignals[0].key).toBe('primaryColor');
  });

  it('strips meta-commentary from display-ready copy', () => {
    expect(toDisplayReadyCopy('Suggested tagline: Better Finance. More Possibilities.')).toBe(
      'Better Finance. More Possibilities.',
    );
    expect(
      toDisplayReadyCopy('A professional slogan for AWE Financial: "Better Finance. More Possibilities."'),
    ).toBe('Better Finance. More Possibilities.');
  });

  it('maps finance vs cafe vs takeaway to different archetypes and CTAs', () => {
    expect(inferArchetypeFromHints({ category: 'Finance', businessName: 'AWE Financial' })).toBe(
      'FINANCIAL_SERVICE',
    );
    expect(inferArchetypeFromHints({ category: 'Cafe', businessName: 'Country Cafe' })).toBe('CAFE');
    expect(inferArchetypeFromHints({ businessName: 'Noodle Hut takeaway' })).toBe('FOOD_TAKEAWAY');

    const finance = getArchetypeDefaults('FINANCIAL_SERVICE');
    const cafe = getArchetypeDefaults('CAFE');
    expect(finance.primaryCTAs.join(' ')).toMatch(/Consultation|Enquiry|Options/i);
    expect(finance.forbiddenPatterns).toContain('add_to_cart_default');
    expect(cafe.sectionPriority).toContain('menu');
    expect(cafe.primaryCTAs.join(' ')).toMatch(/Menu|Order/i);
  });

  it('builds materially different composition plans for finance vs cafe', () => {
    const financeUnderstanding = createEmptyBusinessUnderstanding({
      archetype: 'FINANCIAL_SERVICE',
      identity: { name: storeField('AWE Financial', { status: 'VERIFIED' }) },
      primaryActions: ['Book a Consultation'],
      secondaryActions: ['Call Adviser'],
    });
    const cafeUnderstanding = createEmptyBusinessUnderstanding({
      archetype: 'CAFE',
      identity: { name: storeField('Country Cafe', { status: 'VERIFIED' }) },
      primaryActions: ['View Menu'],
    });
    const financeBrand = createEmptyBrandStyleProfile({
      sourceConfidence: 0.8,
      primaryColors: ['#0B1F3A', '#1FA8FF'],
      tone: 'professional',
      graphicLanguage: 'corporate',
      negativeResourceCharacteristics: ['pets', 'food', 'beauty'],
    });
    const cafeBrand = createEmptyBrandStyleProfile({
      sourceConfidence: 0.8,
      primaryColors: ['#5C4033', '#F5F0E6'],
      tone: 'warm',
      graphicLanguage: 'rustic',
      imageryDirection: 'food-led',
    });

    const financePlan = buildStoreCompositionPlan({
      understanding: financeUnderstanding,
      brand: financeBrand,
    });
    const cafePlan = buildStoreCompositionPlan({
      understanding: cafeUnderstanding,
      brand: cafeBrand,
    });

    expect(financePlan.archetype).toBe('FINANCIAL_SERVICE');
    expect(cafePlan.archetype).toBe('CAFE');
    expect(financePlan.primaryCTA).not.toBe(cafePlan.primaryCTA);
    expect(financePlan.offeringPresentation).toBe('service_list');
    expect(cafePlan.offeringPresentation).toBe('menu');
    expect(financePlan.sectionPriority).toContain('consultation_cta');
    expect(cafePlan.sectionPriority).toContain('menu');
    expect(financePlan.themeSpec.primary).toBe('#0B1F3A');
    expect(cafePlan.themeSpec.primary).toBe('#5C4033');
    expect(evaluateCompositionGenericness(financePlan).ok).toBe(true);
    expect(evaluateCompositionGenericness(cafePlan).ok).toBe(true);
  });

  it('flags retail CTA on financial archetype as generic failure', () => {
    const plan = buildStoreCompositionPlan({
      understanding: createEmptyBusinessUnderstanding({
        archetype: 'FINANCIAL_SERVICE',
        primaryActions: ['Add to Cart'],
      }),
      brand: createEmptyBrandStyleProfile({ sourceConfidence: 0.2 }),
    });
    const gate = evaluateCompositionGenericness(plan);
    expect(gate.ok).toBe(false);
    expect(gate.code).toBe('GENERATION_FAIL_GENERIC');
    expect(gate.reasons.some((r) => /cta|cart|forbidden/i.test(r))).toBe(true);
  });

  it('treats empty brand as cardbey_generic theme priority', () => {
    const brand = createEmptyBrandStyleProfile();
    expect(resolveThemePriorityTier(brand)).toBe('cardbey_generic');
  });
});
