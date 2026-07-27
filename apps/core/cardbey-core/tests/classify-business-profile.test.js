/**
 * classifyBusinessProfile: strict JSON profile for Seed Builder + Validators.
 * Tests: Seafood, Children Clothing, Nails & Beauty, Game centre, Unknown ZZZ + consulting.
 */
import { describe, expect, it } from 'vitest';
import { classifyBusinessProfile, heuristicProfile } from '../src/services/store/classifier/classifyBusinessProfile.js';

const SCHEMA_KEYS = [
  'verticalGroup', 'verticalSlug', 'businessModel', 'audience', 'priceTier',
  'keywords', 'categoryHints', 'forbiddenKeywords', 'businessDescriptionShort', 'confidence',
];

function assertSchema(profile) {
  expect(profile).toBeDefined();
  for (const key of SCHEMA_KEYS) {
    expect(profile).toHaveProperty(key);
  }
  expect(profile.keywords.length).toBeGreaterThanOrEqual(5);
  expect(profile.keywords.length).toBeLessThanOrEqual(12);
  expect(profile.categoryHints.length).toBeGreaterThanOrEqual(3);
  expect(profile.categoryHints.length).toBeLessThanOrEqual(8);
  expect(profile.businessDescriptionShort.length).toBeLessThanOrEqual(140);
  expect(profile.confidence).toBeGreaterThanOrEqual(0);
  expect(profile.confidence).toBeLessThanOrEqual(1);
}

describe('classifyBusinessProfile', () => {
  it('Seafood + Union Road Seafood -> food.seafood, food, products/mixed, b2c', async () => {
    const result = await classifyBusinessProfile({
      businessType: 'Seafood',
      businessName: 'Union Road Seafood',
      location: '',
      notes: '',
    });
    assertSchema(result);
    expect(result.verticalSlug).toBe('food.seafood');
    expect(result.verticalGroup).toBe('food');
    expect(['products', 'mixed']).toContain(result.businessModel);
    expect(result.audience).toBe('b2c');
  });

  it('Children Clothing -> retail (fashion) + audience kids', async () => {
    const result = await classifyBusinessProfile({
      businessType: 'Children Clothing',
      businessName: 'Any Kids Store',
      location: '',
      notes: '',
    });
    assertSchema(result);
    expect(result.verticalSlug).toBe('fashion.kids');
    expect(result.verticalGroup).toBe('retail'); // schema: fashion maps to retail
    expect(result.audience).toBe('kids');
  });

  it('Nails & Beauty -> beauty.nails', async () => {
    const result = await classifyBusinessProfile({
      businessType: 'Nails & Beauty',
      businessName: 'Glam Nails',
      location: '',
      notes: '',
    });
    assertSchema(result);
    expect(result.verticalSlug).toBe('beauty.nails');
    expect(result.verticalGroup).toBe('beauty');
  });

  it('Game centre -> events (entertainment) + bookings', async () => {
    const result = await classifyBusinessProfile({
      businessType: 'Game centre',
      businessName: 'Fun Zone',
      location: '',
      notes: '',
    });
    assertSchema(result);
    expect(result.verticalSlug).toBe('entertainment.game_centre');
    expect(result.verticalGroup).toBe('events'); // schema maps entertainment -> events
    expect(['bookings', 'products', 'mixed', 'services']).toContain(result.businessModel);
  });

  it('Unknown ZZZ + consulting -> services.generic, quote_based', async () => {
    const result = await classifyBusinessProfile({
      businessType: 'ZZZ',
      businessName: 'consulting',
      location: '',
      notes: '',
    });
    assertSchema(result);
    expect(result.verticalSlug).toBe('services.generic');
    expect(result.verticalGroup).toBe('services');
    expect(result.businessModel).toBe('quote_based');
  });
});

describe('classifyBusinessProfile heuristic only (schema)', () => {
  it('heuristicProfile returns exact schema keys and valid ranges', () => {
    const profile = heuristicProfile({ businessType: 'Seafood', businessName: 'Union Road Seafood' });
    assertSchema(profile);
    expect(profile.verticalSlug).toBe('food.seafood');
    expect(profile.verticalGroup).toBe('food');
  });

  it('heuristicProfile Children Clothing -> audience kids', () => {
    const profile = heuristicProfile({ businessType: 'Children Clothing', businessName: 'Kids Co' });
    expect(profile.audience).toBe('kids');
    expect(profile.verticalSlug).toBe('fashion.kids');
  });

  it('heuristicProfile Nails & Beauty -> beauty.nails', () => {
    const profile = heuristicProfile({ businessType: 'Nails & Beauty', businessName: 'Nail Bar' });
    expect(profile.verticalSlug).toBe('beauty.nails');
    expect(profile.verticalGroup).toBe('beauty');
  });

  it('heuristicProfile Game centre -> entertainment.game_centre, verticalGroup events', () => {
    const profile = heuristicProfile({ businessType: 'Game centre', businessName: 'Arcade' });
    expect(profile.verticalSlug).toBe('entertainment.game_centre');
    expect(profile.verticalGroup).toBe('events');
  });

  it('heuristicProfile ZZZ + consulting -> services.generic, quote_based', () => {
    const profile = heuristicProfile({ businessType: 'ZZZ', businessName: 'consulting' });
    expect(profile.verticalSlug).toBe('services.generic');
    expect(profile.verticalGroup).toBe('services');
    expect(profile.businessModel).toBe('quote_based');
  });
});
