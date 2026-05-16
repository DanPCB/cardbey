/**
 * buildCatalog with generationProfile: businessType primary, ~30 items, no vertical leakage.
 * 1) Children Clothing + Yahoo -> kids, fashion.kids, ~30 items, no adult items
 * 2) Seafood store + ZZZ -> food.seafood, ~30 items, no cafe drinks
 * 3) Game centre + CALL0UT -> entertainment/events, no cafe
 */
import { describe, expect, it } from 'vitest';
import { buildCatalog } from '../src/services/draftStore/buildCatalog.js';
import { classifyBusinessProfile } from '../src/services/store/classifier/classifyBusinessProfile.js';
import { selectTemplateId } from '../src/services/draftStore/selectTemplateId.js';

const MIN_ITEMS = 24;
const TARGET_ITEMS = 30;
const ADULT_KEYWORDS = /men's|mens|women's|womens|heels|lingerie|workwear|formal suit|dress shirt|leather boots|adult/i;
const COFFEE_KEYWORDS = /espresso|latte|cappuccino|coffee|mocha|flat white|cold brew|croissant|muffin/i;
const CAFE_DRINK_STRICT = /\bespresso\b|\blatte\b|\bcappuccino\b|\bcoffee\b|\bmocha\b|\bflat white\b|\bcold brew\b/i;

describe('buildCatalog with generationProfile (businessType primary)', () => {
  it('businessName=Yahoo, businessType=Children Clothing -> audience kids, fashion.kids, ~30 items, no adult items', async () => {
    const profile = await classifyBusinessProfile({
      businessName: 'Yahoo',
      businessType: 'Children Clothing',
      location: '',
      notes: '',
    });
    expect(profile.audience).toBe('kids');
    expect(profile.verticalSlug).toBe('fashion.kids');

    const templateId = selectTemplateId(profile.verticalSlug, profile.audience);
    const result = await buildCatalog({
      mode: 'template',
      draftId: 'test-children',
      templateId,
      businessName: 'Yahoo',
      businessType: 'Children Clothing',
      generationProfile: profile,
      verticalSlug: profile.verticalSlug,
      audience: profile.audience,
    });
    expect(result).toBeDefined();
    expect(result.products).toBeDefined();
    expect(result.products.length).toBeGreaterThanOrEqual(MIN_ITEMS);
    expect(result.products.length).toBeLessThanOrEqual(36);

    const namesAndDescriptions = result.products.map((p) => `${p.name || ''} ${p.description || ''}`).join(' ');
    expect(ADULT_KEYWORDS.test(namesAndDescriptions)).toBe(false);
  });

  it('businessName=ZZZ, businessType=Seafood store -> food.seafood, ~30 items, no cafe drinks', async () => {
    const profile = await classifyBusinessProfile({
      businessName: 'ZZZ',
      businessType: 'Seafood store',
      location: '',
      notes: '',
    });
    expect(profile.verticalSlug).toBe('food.seafood');
    expect(profile.verticalGroup).toBe('food');

    const templateId = selectTemplateId(profile.verticalSlug, profile.audience);
    const result = await buildCatalog({
      mode: 'template',
      draftId: 'test-seafood',
      templateId,
      businessName: 'ZZZ',
      businessType: 'Seafood store',
      generationProfile: profile,
      verticalSlug: profile.verticalSlug,
      audience: profile.audience,
    });
    expect(result).toBeDefined();
    expect(result.products.length).toBeGreaterThanOrEqual(MIN_ITEMS);

    const namesAndDescriptions = result.products.map((p) => `${p.name || ''} ${p.description || ''}`).join(' ');
    expect(CAFE_DRINK_STRICT.test(namesAndDescriptions)).toBe(false);
  });

  it('businessName=CALL0UT, businessType=Game centre -> entertainment/events slug, no cafe items', async () => {
    const profile = await classifyBusinessProfile({
      businessName: 'CALL0UT',
      businessType: 'Game centre',
      location: '',
      notes: '',
    });
    expect(profile.verticalSlug).toBe('entertainment.game_centre');
    expect(['events', 'entertainment'].includes(profile.verticalGroup) || profile.verticalSlug.startsWith('entertainment.')).toBe(true);

    const templateId = selectTemplateId(profile.verticalSlug, profile.audience);
    const result = await buildCatalog({
      mode: 'template',
      draftId: 'test-game',
      templateId,
      businessName: 'CALL0UT',
      businessType: 'Game centre',
      generationProfile: profile,
      verticalSlug: profile.verticalSlug,
      audience: profile.audience,
    });
    expect(result).toBeDefined();
    expect(result.products.length).toBeGreaterThanOrEqual(MIN_ITEMS);

    const namesAndDescriptions = result.products.map((p) => `${p.name || ''} ${p.description || ''}`).join(' ');
    expect(COFFEE_KEYWORDS.test(namesAndDescriptions)).toBe(false);
  });
});
