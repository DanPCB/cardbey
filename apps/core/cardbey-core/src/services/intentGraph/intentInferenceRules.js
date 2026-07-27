/**
 * Intent Graph v1: Bakery/Café intent inference rules (rules-first, no AI).
 * Returns 3–5 intents with keys and labels for a given draft preview.
 */

const BAKERY_CAFE_INTENTS = [
  { key: 'promote_breakfast', label: 'Promote breakfast items', keywords: ['breakfast', 'pastry', 'croissant', 'muffin', 'bagel', 'oatmeal', 'eggs', 'bacon', 'waffle', 'pancake', 'morning'] },
  { key: 'highlight_pastries', label: 'Highlight pastries & baked goods', keywords: ['pastry', 'pastries', 'cake', 'croissant', 'bread', 'bun', 'cookie', 'brownie', 'donut', 'doughnut', 'sweet'] },
  { key: 'boost_coffee_drinks', label: 'Boost coffee & drinks', keywords: ['coffee', 'espresso', 'latte', 'cappuccino', 'tea', 'drink', 'beverage', 'smoothie', 'juice', 'cold brew'] },
  { key: 'feature_lunch_savory', label: 'Feature lunch & savory', keywords: ['lunch', 'sandwich', 'salad', 'soup', 'wrap', 'panini', 'savory', 'quiche', 'toast'] },
  { key: 'promote_specials', label: 'Promote daily specials', keywords: ['special', 'daily', 'deal', 'offer', 'combo', 'bundle'] },
];

const BUSINESS_TYPE_TRIGGERS = {
  bakery: ['promote_breakfast', 'highlight_pastries', 'feature_lunch_savory', 'promote_specials'],
  cafe: ['promote_breakfast', 'boost_coffee_drinks', 'highlight_pastries', 'feature_lunch_savory', 'promote_specials'],
  'coffee shop': ['boost_coffee_drinks', 'promote_breakfast', 'highlight_pastries', 'promote_specials'],
  'coffee-shop': ['boost_coffee_drinks', 'promote_breakfast', 'highlight_pastries', 'promote_specials'],
};

function normalizeForMatch(str) {
  if (str == null || typeof str !== 'string') return '';
  return str.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Infer 3–5 intents for a draft from preview (storeType, categories, items). Rules-only.
 * @param {{ storeType?: string, categories?: Array<{ name?: string, id?: string }>, items?: Array<{ name?: string, description?: string, categoryName?: string }> }} preview
 * @returns {{ intentKey: string, label: string, weight: number, signals: Array<{ signalType: string, signalValue: string, strength: number }> }[]}
 */
export function inferIntentsFromPreview(preview) {
  if (!preview || typeof preview !== 'object') return [];

  const storeType = normalizeForMatch(preview.storeType || preview.storeName || '');
  const categories = Array.isArray(preview.categories) ? preview.categories : [];
  const items = Array.isArray(preview.items) ? preview.items : [];

  const allText = [
    storeType,
    ...categories.map((c) => (c && (c.name || c.label || c.id)) ? normalizeForMatch(String(c.name || c.label || c.id)) : ''),
    ...items.map((i) => {
      if (!i || typeof i !== 'object') return '';
      return [i.name, i.description, i.categoryName].filter(Boolean).map(String).map(normalizeForMatch).join(' ');
    }),
  ].join(' ');

  const matchedIntents = new Map(); // key -> { intent, weight, signals }

  // 1) Business type: seed intents by store type
  const typeNorm = storeType.replace(/-/g, ' ').trim();
  for (const [type, intentKeys] of Object.entries(BUSINESS_TYPE_TRIGGERS)) {
    if (typeNorm.includes(type) || type.replace(/\s/g, '').includes(typeNorm.replace(/\s/g, ''))) {
      intentKeys.forEach((key, idx) => {
        const def = BAKERY_CAFE_INTENTS.find((i) => i.key === key);
        if (def && !matchedIntents.has(key)) {
          matchedIntents.set(key, {
            intent: def,
            weight: 0.6 + (0.1 * (1 - idx / Math.max(1, intentKeys.length))),
            signals: [{ signalType: 'business_type', signalValue: type, strength: 0.9 }],
          });
        }
      });
      break;
    }
  }

  // 2) Keyword match from categories and items: boost weight and add signals
  for (const def of BAKERY_CAFE_INTENTS) {
    for (const kw of def.keywords) {
      if (!allText.includes(kw)) continue;
          const existing = matchedIntents.get(def.key);
          const signal = { signalType: 'item_keyword', signalValue: kw, strength: 0.7 };
          const catMatch = categories.some((c) => (c && (c.name || c.label)) && normalizeForMatch(String(c.name || c.label)).includes(kw));
          if (catMatch) signal.signalType = 'category_match';
          if (existing) {
            existing.weight = Math.min(1, existing.weight + 0.1);
            if (!existing.signals.some((s) => s.signalValue === kw)) existing.signals.push(signal);
          } else {
            matchedIntents.set(def.key, {
              intent: def,
              weight: 0.5,
              signals: [signal],
            });
          }
    }
  }

  // 3) Cap at 5, sort by weight desc
  const list = Array.from(matchedIntents.values())
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 5);

  return list.map(({ intent, weight, signals }) => ({
    intentKey: intent.key,
    label: intent.label,
    weight: Math.min(1, Math.max(0.2, weight)),
    signals: signals.slice(0, 10),
  }));
}
