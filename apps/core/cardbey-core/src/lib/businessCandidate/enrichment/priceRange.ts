/**
 * Google Places price_level → display string.
 */

export const PRICE_LEVEL_MAP: Record<number, string> = {
  0: 'Free',
  1: '$',
  2: '$$',
  3: '$$$',
  4: '$$$$',
};

export function priceRangeFromRawSource(
  rawSourceJson: Record<string, unknown> | null | undefined,
): string | null {
  if (!rawSourceJson || typeof rawSourceJson !== 'object') return null;
  const pl = rawSourceJson.price_level ?? rawSourceJson.priceLevel;
  if (typeof pl === 'number' && pl in PRICE_LEVEL_MAP) {
    return PRICE_LEVEL_MAP[pl] ?? null;
  }
  return null;
}
