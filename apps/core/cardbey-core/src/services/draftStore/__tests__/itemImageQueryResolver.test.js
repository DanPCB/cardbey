import { describe, it, expect } from 'vitest';
import {
  resolveItemImageSearchQuery,
  resolveHeroImageSearchQuery,
  resolveBlueprintItemImageHint,
  resolveIndustryForbiddenImageKeywords,
} from '../itemImageQueryResolver.js';

describe('itemImageQueryResolver', () => {
  it('resolves handyman item hints from blueprint by title', () => {
    const hint = resolveBlueprintItemImageHint('Door Repair', {
      storeName: 'CA HANDY MAN',
      verticalSlug: 'retail.home_garden',
    });
    expect(hint).toBe('handyman repairing interior door hinge');
  });

  it('resolves blueprint hint after stripping source suffix from title', () => {
    const hint = resolveBlueprintItemImageHint("Door Repair - Chef's", {
      storeName: 'CA HANDY MAN',
      verticalSlug: 'services.handyman',
    });
    expect(hint).toBe('handyman repairing interior door hinge');
  });

  it('uses explicit imageQueryHint when provided', () => {
    const query = resolveItemImageSearchQuery({
      itemName: 'Door Repair',
      imageQueryHint: 'custom door repair photo',
      storeName: 'CA HANDY MAN',
    });
    expect(query).toBe('custom door repair photo');
  });

  it('derives search query for handyman catalog items without explicit hint', () => {
    const query = resolveItemImageSearchQuery({
      itemName: 'Minor Plumbing Repairs',
      storeName: 'CA HANDY MAN',
      verticalSlug: 'services.handyman',
    });
    expect(query).toMatch(/plumb|tap|leak|handyman/i);
  });

  it('resolves hero query for handyman store (not bakery)', () => {
    const hero = resolveHeroImageSearchQuery({
      storeName: 'CA HANDY MAN',
      businessType: 'handyman',
      verticalSlug: 'services.handyman',
    });
    expect(hero).toMatch(/handyman|repair|maintenance|contractor/i);
    expect(hero).not.toMatch(/bakery|donut|pastry/i);
  });

  it('forbids food keywords for non-food service verticals', () => {
    const forbidden = resolveIndustryForbiddenImageKeywords({
      storeName: 'CA HANDY MAN',
      verticalSlug: 'services.handyman',
    });
    expect(forbidden).toContain('bakery');
    expect(forbidden).toContain('cafe');
  });

  it('does not forbid food keywords for food verticals', () => {
    const forbidden = resolveIndustryForbiddenImageKeywords({
      verticalSlug: 'food.bakery',
      verticalGroup: 'food',
    });
    expect(forbidden).toEqual([]);
  });

  it('resolves bakery item hints from blueprint', () => {
    const query = resolveItemImageSearchQuery({
      itemName: 'Croissant',
      verticalSlug: 'food.bakery',
      businessType: 'bakery',
    });
    expect(query).toMatch(/croissant|bakery/i);
  });
});
