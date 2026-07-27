/**
 * Orchestra default: AI classify + vertical lock. Heuristic fallback never defaults to cafe for non-food.
 * Tests: Furniture -> retail.furniture (not cafe), Seafood -> food.seafood (not cafe), Children -> fashion.kids,
 * Classifier fail -> heuristic returns non-cafe.
 */
import { describe, expect, it } from 'vitest';
import { resolveVertical } from '../src/lib/verticals/verticalTaxonomy.js';
import { selectTemplateId } from '../src/services/draftStore/selectTemplateId.js';

describe('Orchestra classify default (heuristic fallback)', () => {
  it('Furniture store + ZZZ -> verticalSlug retail.furniture, templateId is not cafe', () => {
    const resolved = resolveVertical({
      businessType: 'Furniture store',
      businessName: 'ZZZ',
      userNotes: '',
      explicitVertical: null,
    });
    expect(resolved.slug).toBe('retail.furniture');
    expect(resolved.group).toBe('retail');
    const templateId = selectTemplateId(resolved.slug);
    expect(templateId).not.toBe('cafe');
    expect(templateId).toBe('retail');
  });

  it('Seafood + Union Road -> food.seafood, not cafe template when templateId from vertical', () => {
    const resolved = resolveVertical({
      businessType: 'Seafood',
      businessName: 'Union Road',
      userNotes: '',
      explicitVertical: null,
    });
    expect(resolved.slug).toBe('food.seafood');
    const templateId = selectTemplateId(resolved.slug);
    expect(templateId).toBe('food_seafood');
    expect(templateId).not.toBe('cafe');
  });

  it('Children Clothing -> fashion.kids, templateId fashion_kids', () => {
    const resolved = resolveVertical({
      businessType: 'Children Clothing',
      businessName: 'Any',
      userNotes: '',
      explicitVertical: null,
    });
    expect(resolved.slug).toBe('fashion.kids');
    expect(selectTemplateId(resolved.slug, 'kids')).toBe('fashion_kids');
  });

  it('Heuristic fallback for generic name only: no food keywords -> not cafe', () => {
    const resolved = resolveVertical({
      businessType: 'Furniture store',
      businessName: 'ZZZ',
      userNotes: '',
      explicitVertical: null,
    });
    expect(resolved.slug).not.toBe('food.cafe');
    expect(resolved.slug).toBe('retail.furniture');
  });

  it('Heuristic with empty businessType and generic name -> services.generic (never cafe)', () => {
    const resolved = resolveVertical({
      businessType: '',
      businessName: 'Google',
      userNotes: '',
      explicitVertical: null,
    });
    expect(resolved.slug).not.toBe('food.cafe');
    expect(resolved.group).toBe('services');
    expect(selectTemplateId(resolved.slug)).toBe('services_generic');
  });
});
