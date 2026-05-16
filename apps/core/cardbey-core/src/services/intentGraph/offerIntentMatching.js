/**
 * Intent Graph v1: Match offers/items/categories to intents with score + evidence (rules-only).
 */

const BAKERY_CAFE_INTENTS = [
  { key: 'promote_breakfast', keywords: ['breakfast', 'pastry', 'croissant', 'muffin', 'bagel', 'oatmeal', 'eggs', 'bacon', 'waffle', 'pancake', 'morning'] },
  { key: 'highlight_pastries', keywords: ['pastry', 'pastries', 'cake', 'croissant', 'bread', 'bun', 'cookie', 'brownie', 'donut', 'doughnut', 'sweet'] },
  { key: 'boost_coffee_drinks', keywords: ['coffee', 'espresso', 'latte', 'cappuccino', 'tea', 'drink', 'beverage', 'smoothie', 'juice', 'cold brew'] },
  { key: 'feature_lunch_savory', keywords: ['lunch', 'sandwich', 'salad', 'soup', 'wrap', 'panini', 'savory', 'quiche', 'toast'] },
  { key: 'promote_specials', keywords: ['special', 'daily', 'deal', 'offer', 'combo', 'bundle'] },
];

function normalize(str) {
  if (str == null || typeof str !== 'string') return '';
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

function scoreTextAgainstIntent(text, intent) {
  const t = normalize(text);
  if (!t) return { score: 0, matchedTerms: [] };
  const matched = intent.keywords.filter((kw) => t.includes(kw));
  if (matched.length === 0) return { score: 0, matchedTerms: [] };
  const score = Math.min(1, 0.3 + matched.length * 0.2);
  return { score, matchedTerms: matched };
}

/**
 * Match draft preview items and categories to given intents.
 * @param {{ categories?: Array<{ id?: string, name?: string }>, items?: Array<{ id?: string, name?: string, description?: string, categoryName?: string }> }} preview
 * @param {{ intentKey: string, label: string }[]} intents
 */
export function matchOffersToIntents(preview, intents) {
  const results = [];
  const categories = Array.isArray(preview?.categories) ? preview.categories : [];
  const items = Array.isArray(preview?.items) ? preview.items : [];
  const intentDefs = new Map(BAKERY_CAFE_INTENTS.map((d) => [d.key, d]));

  for (const cat of categories) {
    if (!cat || (!cat.id && !cat.name)) continue;
    const ref = (cat.id || cat.name || '').toString().trim() || `cat_${cat.name || 'unknown'}`;
    const text = [cat.name, cat.label].filter(Boolean).map(String).join(' ');
    for (const intent of intents) {
      const def = intentDefs.get(intent.intentKey) || { keywords: [] };
      const { score, matchedTerms } = scoreTextAgainstIntent(text, def);
      if (score > 0) {
        const keywordMatch = Math.min(0.5, (matchedTerms?.length || 0) * 0.1);
        results.push({
          intentKey: intent.intentKey,
          offerType: 'category',
          offerRef: ref,
          score,
          evidence: {
            reason: 'category_match',
            matchedTerms,
            source: 'rules',
            scoreBreakdown: { categoryFit: score, itemFit: 0, storeTypeBoost: 0, keywordMatch },
          },
        });
      }
    }
  }

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const ref = (item.id || item.name || '').toString().trim() || `item_${String(item.name || 'unknown').slice(0, 50)}`;
    const text = [item.name, item.description, item.categoryName].filter(Boolean).map(String).join(' ');
    for (const intent of intents) {
      const def = intentDefs.get(intent.intentKey) || { keywords: [] };
      const { score, matchedTerms } = scoreTextAgainstIntent(text, def);
      if (score > 0) {
        const keywordMatch = Math.min(0.5, (matchedTerms?.length || 0) * 0.1);
        results.push({
          intentKey: intent.intentKey,
          offerType: 'item',
          offerRef: ref,
          score,
          evidence: {
            reason: 'item_keyword',
            matchedTerms,
            source: 'rules',
            scoreBreakdown: { categoryFit: 0, itemFit: score, storeTypeBoost: 0, keywordMatch },
          },
        });
      }
    }
  }

  return results;
}
