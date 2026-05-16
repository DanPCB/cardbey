/**
 * Price ladder resolver – default priceMin/priceMax for items missing prices.
 * Not auto-applied; use explicitly when building/validating packs.
 */

export interface PriceLadderCategory {
  min?: number;
  max?: number;
}

export interface PriceLadder {
  businessType: string;
  region: string;
  currency: string;
  byCategoryKey: Record<string, PriceLadderCategory>;
  defaults: { min?: number; max?: number };
}

export interface ItemForPrice {
  defaultCategoryKey?: string | null;
  categoryKey?: string | null;
  suggestedPriceMin?: number | null;
  suggestedPriceMax?: number | null;
  currencyCode?: string | null;
}

export interface ResolvedPrice {
  min: number | null;
  max: number | null;
  currency: string | null;
}

/**
 * Resolve default priceMin/priceMax for an item from a ladder.
 * Uses category ladder when categoryKey matches; otherwise uses ladder.defaults.
 * If item already has both suggestedPriceMin and suggestedPriceMax, returns them (with currency from item or ladder).
 */
export function resolvePriceForItem(item: ItemForPrice, ladder: PriceLadder): ResolvedPrice {
  const currency = item.currencyCode?.trim() || ladder.currency || null;
  const catKey = item.categoryKey ?? item.defaultCategoryKey;
  const categoryLadder = catKey ? ladder.byCategoryKey[catKey] : undefined;
  const def = ladder.defaults ?? {};

  const hasMin = item.suggestedPriceMin != null && typeof item.suggestedPriceMin === 'number';
  const hasMax = item.suggestedPriceMax != null && typeof item.suggestedPriceMax === 'number';

  if (hasMin && hasMax) {
    return {
      min: item.suggestedPriceMin,
      max: item.suggestedPriceMax,
      currency,
    };
  }

  const min =
    hasMin ? item.suggestedPriceMin! :
    (categoryLadder?.min ?? def.min) ?? null;
  const max =
    hasMax ? item.suggestedPriceMax! :
    (categoryLadder?.max ?? def.max) ?? null;

  return { min, max, currency };
}
