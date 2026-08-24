/**
 * Pexels / stock hero search query ladder — venue-specific → category fallback.
 */

function norm(text: string | null | undefined): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function includesToken(text: string, tokens: string[]): boolean {
  return tokens.some((t) => text.includes(t));
}

/** Infer a Pexels-friendly sub-category token (pub, cafe, bakery, …). */
export function inferHeroSubCategory(input: {
  businessName?: string | null;
  businessType?: string | null;
  placesTypes?: string[] | null;
  tags?: string[] | null;
}): string | null {
  const text = norm(
    [input.businessName, input.businessType, ...(input.placesTypes ?? []), ...(input.tags ?? [])].join(' '),
  );
  if (includesToken(text, ['m a', 'merger', 'acquisition', 'capital advisory', 'capital group', 'corporate finance'])) {
    return 'corporate advisory';
  }
  if (includesToken(text, ['pub', 'tavern', 'inn', 'hotel', 'bar', 'brewery', 'grill', 'bistro', 'cellars'])) {
    return 'pub';
  }
  if (includesToken(text, ['cafe', 'coffee', 'espresso'])) return 'cafe';
  if (includesToken(text, ['bakery', 'bakehouse', 'pastry', 'cake'])) return 'bakery';
  if (includesToken(text, ['restaurant', 'eatery', 'kitchen', 'dining'])) return 'restaurant';
  if (includesToken(text, ['hair', 'salon', 'barber', 'nail', 'beauty', 'spa'])) return 'hair salon';
  if (includesToken(text, ['grocery', 'supermarket', 'foodstore', 'food store'])) return 'grocery store';
  if (includesToken(text, ['hotel', 'motel'])) return 'hotel';
  return null;
}

function topCategorySearchTerms(category: string | null | undefined): string | null {
  const c = norm(category);
  if (!c || c === 'other') return null;
  if (c.includes('professional')) return 'corporate advisory office Melbourne';
  if (c.includes('food') || c.includes('drink')) return 'bar restaurant food drink';
  if (c.includes('grocery')) return 'grocery store supermarket';
  if (c.includes('beauty') || c.includes('wellness')) return 'beauty salon spa';
  if (c.includes('fashion')) return 'boutique fashion store';
  if (c.includes('home') || c.includes('garden')) return 'home garden store';
  if (c.includes('fitness') || c.includes('health')) return 'gym fitness studio';
  if (c.includes('pet')) return 'pet store grooming';
  if (c.includes('auto') || c.includes('transport')) return 'automotive workshop';
  return null;
}

export const CATEGORY_HERO_QUERIES: Record<string, string[]> = {
  professional: [
    '{name} {suburb}',
    'corporate advisory meeting Australia',
    'professional services office Melbourne',
    'business advisory team meeting',
    'corporate office building Melbourne',
  ],
  'ma-advisory': [
    '{name} {suburb}',
    'mergers acquisitions business deal handshake',
    'corporate advisory professionals',
    'business deal signing boardroom',
  ],
  'food-and-drink': [
    '{name} {suburb}',
    '{subCategory} {suburb}',
    '{subCategory} Melbourne',
    'restaurant cafe food Melbourne',
    'restaurant interior food',
  ],
  'bar-pub': ['pub bar interior Melbourne', 'bar drinks cocktails', 'pub hotel exterior'],
  pub: ['pub bar interior Melbourne', 'bar drinks cocktails', 'pub hotel exterior'],
  default: [
    '{name} {suburb}',
    '{subCategory} {suburb}',
    '{subCategory} Melbourne',
    '{topCategory} Melbourne',
    '{topCategory} shop interior',
  ],
};

export function buildHeroQueries(
  businessName: string,
  suburb: string,
  categoryId: string,
  subCategoryId: string | null,
  topCategoryLabel: string,
  subCategoryLabel: string | null,
): string[] {
  const templates =
    CATEGORY_HERO_QUERIES[subCategoryId ?? ''] ??
    CATEGORY_HERO_QUERIES[categoryId] ??
    CATEGORY_HERO_QUERIES.default;

  return templates.map((t) =>
    t
      .replace('{name}', businessName)
      .replace('{suburb}', suburb)
      .replace('{subCategory}', subCategoryLabel ?? topCategoryLabel)
      .replace('{topCategory}', topCategoryLabel),
  );
}

/**
 * Ordered fallback ladder — stop at first query returning photos.
 */
export function buildHeroSearchQueries(input: {
  businessName?: string | null;
  suburb?: string | null;
  category?: string | null;
  businessType?: string | null;
  placesTypes?: string[] | null;
  tags?: string[] | null;
  metro?: string | null;
}): string[] {
  const suburb = input.suburb?.trim() || 'Melbourne';
  const metro = input.metro?.trim() || 'Melbourne';
  const name = input.businessName?.trim();
  const category = input.category?.trim() || '';
  const categoryId = norm(category).replace(/\s+/g, '-') || 'default';
  const sub =
    inferHeroSubCategory(input) ??
    (input.businessType?.trim() ? norm(input.businessType).split(' ')[0] : null);
  const top = topCategorySearchTerms(input.category);

  // Prefer category templates when we know the vertical (avoids "Other suburb storefront")
  if (category && !/^other$/i.test(category)) {
    const fromTemplates = buildHeroQueries(
      name || category,
      suburb,
      categoryId.includes('professional') ? 'professional' : categoryId.includes('food') ? 'food-and-drink' : categoryId,
      sub === 'corporate advisory' ? 'ma-advisory' : sub === 'pub' ? 'bar-pub' : null,
      category,
      sub,
    );
    if (fromTemplates.length) {
      return [...new Set(fromTemplates.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))];
    }
  }

  const out: string[] = [];
  if (name) out.push(`${name} ${suburb}`);
  if (sub) {
    out.push(`${sub} ${suburb}`);
    out.push(`${sub} ${metro}`);
  }
  if (top) {
    out.push(`${top} ${metro}`);
    out.push(`${top} interior`);
  }
  if (!out.length) out.push(`${suburb} local business storefront`);

  return [...new Set(out.map((q) => q.replace(/\s+/g, ' ').trim()).filter(Boolean))];
}
