/**
 * Draft catalog category helpers — never surface placeholder ids (cat_0, pre_cat_*) as labels.
 */

const PLACEHOLDER_CATEGORY_NAME_RE = /^cat_\d+$/i;
const PLACEHOLDER_CATEGORY_ID_RE = /^(cat_\d+|pre_cat_[\w-]+|uncategorized)$/i;

/**
 * @param {string | null | undefined} value
 * @returns {boolean}
 */
export function isPlaceholderCategoryName(value) {
  const s = String(value ?? '').trim();
  if (!s) return true;
  if (PLACEHOLDER_CATEGORY_NAME_RE.test(s)) return true;
  if (PLACEHOLDER_CATEGORY_ID_RE.test(s)) return true;
  if (/^uncategorized$/i.test(s)) return true;
  return false;
}

/**
 * Human-readable category label from an item row (never returns placeholder ids).
 * @param {object | null | undefined} item
 * @returns {string | null}
 */
export function resolveCategoryLabelFromItem(item) {
  if (!item || typeof item !== 'object') return null;
  const candidates = [item.categoryName, item.category];
  for (const raw of candidates) {
    const s = String(raw ?? '').trim();
    if (s && !isPlaceholderCategoryName(s)) return s;
  }
  return null;
}

/**
 * @param {string} name
 * @returns {string}
 */
function slugifyCategoryId(name) {
  const slug = String(name)
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '');
  return slug || 'other';
}

/**
 * Recompute draft.preview.categories from items grouped by real category names.
 * Items without a name merge into "Other". Never emits cat_N display names.
 * @param {object[]} items
 * @returns {{ categories: { id: string, name: string }[], items: object[] }}
 */
export function recomputeDraftCategoriesFromItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { categories: [], items: [] };
  }

  const byName = new Map();
  items.forEach((p, idx) => {
    const label = resolveCategoryLabelFromItem(p) || 'Other';
    if (!byName.has(label)) {
      byName.set(label, { name: label, productIds: [] });
    }
    byName.get(label).productIds.push(p.id || `item_${idx}`);
  });

  const nameToId = new Map();
  const categories = Array.from(byName.entries()).map(([name]) => {
    const id = name.toLowerCase() === 'other' ? 'other' : `cat_${slugifyCategoryId(name)}`;
    nameToId.set(name, id);
    return { id, name };
  });

  const itemsWithCategoryId = items.map((p, idx) => {
    const label = resolveCategoryLabelFromItem(p) || 'Other';
    return {
      ...p,
      id: p.id || `item_${idx}`,
      categoryId: nameToId.get(label) || 'other',
      ...(label !== 'Other' && !p.category ? { category: label } : {}),
      ...(label !== 'Other' && !p.categoryName ? { categoryName: label } : {}),
    };
  });

  return { categories, items: itemsWithCategoryId };
}

/**
 * Sanitize category list for preview/publish — remap placeholder names to Other.
 * @param {object[]} categories
 * @returns {object[]}
 */
export function sanitizeDraftCategoryList(categories) {
  if (!Array.isArray(categories)) return [];
  const out = [];
  const seenIds = new Set();
  let hasOther = false;

  for (const raw of categories) {
    if (!raw || typeof raw !== 'object') continue;
    let name = String(raw.name ?? raw.label ?? '').trim();
    if (isPlaceholderCategoryName(name)) {
      name = 'Other';
    }
    let id = String(raw.id ?? '').trim();
    if (!id || isPlaceholderCategoryName(id)) {
      id = name.toLowerCase() === 'other' ? 'other' : `cat_${slugifyCategoryId(name)}`;
    }
    if (id === 'other' || name.toLowerCase() === 'other') {
      hasOther = true;
      id = 'other';
      name = 'Other';
    }
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    out.push({ id, name });
  }

  if (!hasOther) {
    out.push({ id: 'other', name: 'Other' });
  }
  return out;
}

/**
 * Publish gate: reject category sets with placeholder labels.
 * @param {object[] | null | undefined} categories
 * @returns {{ ok: boolean, invalidNames?: string[] }}
 */
export function validateCategoriesForPublish(categories) {
  const list = Array.isArray(categories) ? categories : [];
  const invalidNames = list
    .map((c) => String(c?.name ?? c?.label ?? '').trim())
    .filter((name) => name && PLACEHOLDER_CATEGORY_NAME_RE.test(name));
  if (invalidNames.length > 0) {
    return { ok: false, invalidNames };
  }
  return { ok: true };
}
