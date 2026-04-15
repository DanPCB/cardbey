/**
 * Seed catalog: fetch and cache ~30 item names per vertical when no template pack exists.
 * Uses Wikidata SPARQL (names only) + curated fallbacks. Cache per verticalSlug + optional subIntent.
 * Do not replace existing templates; only used when templateId is missing or template pack not found.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const TARGET_ITEM_COUNT = 30;
const WIKIDATA_ENDPOINT = 'https://query.wikidata.org/sparql';

/** Curated seed items when Wikidata is unavailable or insufficient. Names only; descriptions generic. */
const CURATED_SEEDS = {
  'retail.furniture': [
    'Sofa', 'Dining Table', 'Coffee Table', 'Dining Chair', 'Office Chair', 'Bed Frame', 'Mattress', 'Bookshelf', 'Wardrobe', 'Desk', 'Sideboard', 'TV Unit', 'Bookshelf', 'Bar Stool', 'Console Table', 'Accent Chair', 'Nightstand', 'Dresser', 'Bookshelf Unit', 'Outdoor Dining Set', 'Lounge Chair', 'Kid\'s Bed', 'Study Desk', 'Filing Cabinet', 'Display Cabinet', 'Shoe Rack', 'Coat Rack', 'Shelving Unit', 'Bench', 'Ottoman',
  ],
  'entertainment.game_centre': [
    'Arcade Tokens (20)', 'Arcade Tokens (50)', 'Unlimited Arcade (1 hr)', 'VR Session (15 min)', 'VR Session (30 min)', 'Bowling Lane (1 hr)', 'Laser Tag Game', 'Laser Tag Party Pack', 'Mini Golf (18 holes)', 'Trampoline Session (1 hr)', 'Birthday Party Package', 'Party Room Hire (2 hr)', 'Group Booking (10+)', 'School Holiday Pass', 'Prize Redemption', 'VR Party Package', 'Kids Arcade Pass', 'Climbing Wall Session', 'Escape Room (60 min)', 'Pool Table (30 min)', 'Air Hockey', 'Racing Simulator', 'Dance Game Session', 'Crane Game Tokens', 'Prize Counter Redemption', 'Food Combo Deal', 'Drinks at Counter', 'Private Party Package', 'Corporate Event Package', 'Gift Card',
  ],
  'food.seafood': [
    'Natural Oysters (6)', 'Natural Oysters (12)', 'Kilpatrick Oysters', 'Grilled Barramundi', 'Pan-Seared Salmon', 'Seafood Pasta', 'Salt & Pepper Calamari', 'Seafood Platter (2 ppl)', 'Seafood Platter (4 ppl)', 'Battered Fish & Chips', 'Grilled Fish & Salad', 'Chips', 'Garden Salad', 'Garlic Bread', 'Sparkling Water', 'Soft Drink', 'Lemon Lime & Bitters', 'Clam Chowder', 'Fish Tacos', 'Shrimp Scampi', 'Crab Cakes', 'Lobster Roll', 'Tuna Poke', 'Seafood Chowder', 'Mussels in Wine', 'Grilled Prawns', 'Sashimi Platter', 'Fish of the Day', 'Seafood Risotto', 'Oyster Kilpatrick (6)',
  ],
};

/**
 * Map verticalSlug to Wikidata SPARQL query (returns ?itemLabel). Limit 30. English labels only.
 * Returns null if we use curated list only for this vertical.
 */
function getWikidataQuery(verticalSlug, subIntent) {
  const slug = (verticalSlug || '').toLowerCase().trim();
  // Furniture: subclasses of furniture (Q11482) - instances or subclasses that have labels
  if (slug === 'retail.furniture') {
    return `
SELECT DISTINCT ?itemLabel WHERE {
  ?item wdt:P31/wdt:P279* wd:Q11482.
  ?item rdfs:label ?itemLabel.
  FILTER(LANG(?itemLabel) = "en")
  FILTER(STRSTARTS(LCASE(?itemLabel), "sofa") || STRSTARTS(LCASE(?itemLabel), "table") || STRSTARTS(LCASE(?itemLabel), "chair") || STRSTARTS(LCASE(?itemLabel), "bed") || STRSTARTS(LCASE(?itemLabel), "desk") || STRSTARTS(LCASE(?itemLabel), "cabinet") || STRSTARTS(LCASE(?itemLabel), "shelf") || STRSTARTS(LCASE(?itemLabel), "wardrobe") || STRSTARTS(LCASE(?itemLabel), "dresser") || STRSTARTS(LCASE(?itemLabel), "stool") || CONTAINS(LCASE(?itemLabel), "table") || CONTAINS(LCASE(?itemLabel), "chair") || CONTAINS(LCASE(?itemLabel), "sofa") || CONTAINS(LCASE(?itemLabel), "bed"))
} LIMIT 30`;
  }
  // Game centre / arcade: use curated (Wikidata has games, not services)
  if (slug === 'entertainment.game_centre' || slug.startsWith('entertainment.')) {
    return null;
  }
  // Seafood: dishes that are seafood-related (Q25403900 = seafood, or subclass of dish + seafood)
  if (slug === 'food.seafood') {
    return `
SELECT DISTINCT ?itemLabel WHERE {
  { ?item wdt:P279* wd:Q25403900. } UNION
  { ?item wdt:P31 wd:Q25403900. } UNION
  { ?item wdt:P31/wdt:P279* wd:Q2095. FILTER(EXISTS { ?item wdt:P361 wd:Q25403900. }) }
  ?item rdfs:label ?itemLabel.
  FILTER(LANG(?itemLabel) = "en")
  FILTER(STRLEN(?itemLabel) < 50)
} LIMIT 30`;
  }
  return null;
}

/**
 * Fetch labels from Wikidata SPARQL. Returns array of { name: string } or empty on failure.
 */
async function fetchWikidataLabels(query) {
  if (!query || typeof query !== 'string') return [];
  try {
    const url = `${WIKIDATA_ENDPOINT}?query=${encodeURIComponent(query)}&format=json`;
    const res = await fetch(url, {
      headers: { Accept: 'application/sparql-results+json' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    const bindings = data?.results?.bindings || [];
    const names = bindings
      .map((b) => b.itemLabel?.value)
      .filter((v) => v && typeof v === 'string' && v.trim().length > 0 && v.length < 80);
    return [...new Set(names)].slice(0, TARGET_ITEM_COUNT).map((name) => ({ name: name.trim() }));
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[seedCatalog] Wikidata fetch failed:', err?.message || err);
    }
    return [];
  }
}

/**
 * Normalize seed items to { name, description? }[]. Cap at TARGET_ITEM_COUNT.
 */
function normalizeSeedItems(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, TARGET_ITEM_COUNT).map((it) => ({
    name: (it && (it.name || it.itemLabel || String(it))).toString().trim() || 'Item',
    description: it?.description != null ? String(it.description).trim() : null,
  })).filter((it) => it.name.length >= 2);
}

/**
 * Get cached seed catalog. Returns { items: { name, description? }[], source: 'cache' } or null on miss.
 * @param {string} verticalSlug
 * @param {string} [subIntent]
 */
export async function getSeedCatalog(verticalSlug, subIntent = null) {
  const slug = (verticalSlug || '').toString().trim();
  const sub = subIntent != null ? String(subIntent).trim() : null;
  if (!slug) return null;
  try {
    const row = await prisma.seedCatalog.findUnique({
      where: {
        verticalSlug_subIntent: { verticalSlug: slug, subIntent: sub || '' },
      },
    });
    if (!row || !row.itemsJson) return null;
    let items;
    try {
      items = JSON.parse(row.itemsJson);
    } catch {
      return null;
    }
    const normalized = normalizeSeedItems(items);
    if (normalized.length < 10) return null;
    if (process.env.NODE_ENV !== 'production') {
      console.log('[seedCatalog] cache hit', { verticalSlug: slug, subIntent: sub, itemCount: normalized.length });
    }
    return { items: normalized, source: 'cache' };
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[seedCatalog] getSeedCatalog error:', err?.message || err);
    }
    return null;
  }
}

/**
 * Fetch seed from Wikidata (when query exists) and/or curated list; normalize and save. Returns { items, source: 'wikidata'|'curated' } or null.
 */
export async function fetchSeedCatalogFromWikidata(verticalSlug, subIntent = null) {
  const slug = (verticalSlug || '').toString().trim();
  if (!slug) return null;

  const curated = CURATED_SEEDS[slug] || CURATED_SEEDS[slug.split('.')[0]];
  const query = getWikidataQuery(slug, subIntent);

  let items = [];
  let source = 'curated';

  if (query) {
    const wikidataItems = await fetchWikidataLabels(query);
    if (wikidataItems.length >= 15) {
      items = wikidataItems;
      source = 'wikidata';
    }
  }
  if (items.length < 20 && Array.isArray(curated) && curated.length > 0) {
    items = curated.map((name) => ({ name: String(name).trim() }));
    source = 'curated';
  }
  items = normalizeSeedItems(items);
  if (items.length < 10) return null;

  const sub = subIntent != null ? String(subIntent).trim() : null;
  await saveSeedCatalog(slug, sub, items);
  if (process.env.NODE_ENV !== 'production') {
    console.log('[seedCatalog] fetch and save', { verticalSlug: slug, subIntent: sub, source, itemCount: items.length });
  }
  return { items, source };
}

/**
 * Save seed catalog to DB (upsert by verticalSlug + subIntent).
 */
export async function saveSeedCatalog(verticalSlug, subIntent, items) {
  const slug = (verticalSlug || '').toString().trim();
  const sub = subIntent != null && String(subIntent).trim() !== '' ? String(subIntent).trim() : '';
  const normalized = normalizeSeedItems(items);
  if (!slug || normalized.length === 0) return;
  try {
    await prisma.seedCatalog.upsert({
      where: {
        verticalSlug_subIntent: { verticalSlug: slug, subIntent: sub },
      },
      create: {
        verticalSlug: slug,
        subIntent: sub,
        itemsJson: JSON.stringify(normalized),
      },
      update: {
        itemsJson: JSON.stringify(normalized),
        updatedAt: new Date(),
      },
    });
  } catch (err) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('[seedCatalog] saveSeedCatalog error:', err?.message || err);
    }
  }
}

/**
 * Get or fetch seed catalog: check cache first; on miss, fetch (Wikidata + curated) and cache.
 * Returns { items: { name, description? }[], source: 'cache'|'wikidata'|'curated' } or null.
 */
export async function getOrFetchSeedCatalog(verticalSlug, subIntent = null) {
  const cached = await getSeedCatalog(verticalSlug, subIntent);
  if (cached) return cached;
  if (process.env.NODE_ENV !== 'production') {
    console.log('[seedCatalog] cache miss', { verticalSlug: verticalSlug || '(empty)', subIntent: subIntent ?? '(none)' });
  }
  return fetchSeedCatalogFromWikidata(verticalSlug, subIntent);
}
