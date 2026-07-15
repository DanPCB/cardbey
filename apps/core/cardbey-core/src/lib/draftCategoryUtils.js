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
  // Legacy flatten default — not a real menu section
  if (/^general$/i.test(s)) return true;
  return false;
}

/**
 * Human-readable category label from an item row (never returns placeholder ids).
 * Prefers categoryPath leaf / joined display over flat category when present.
 * @param {object | null | undefined} item
 * @returns {string | null}
 */
export function resolveCategoryLabelFromItem(item) {
  if (!item || typeof item !== 'object') return null;
  const path = Array.isArray(item.categoryPath)
    ? item.categoryPath.map((p) => String(p ?? '').trim()).filter(Boolean)
    : [];
  if (path.length >= 2) {
    const joined = path.join(' · ');
    if (!isPlaceholderCategoryName(joined)) return joined;
  }
  if (path.length === 1 && !isPlaceholderCategoryName(path[0])) return path[0];

  const candidates = [item.categoryName, item.category, item.parentCategory];
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
 * Resolve a stable category path array from an item (never invents "General").
 * @param {object | null | undefined} item
 * @returns {string[]}
 */
export function resolveCategoryPathFromItem(item) {
  if (!item || typeof item !== 'object') return [];
  if (Array.isArray(item.categoryPath) && item.categoryPath.length) {
    return item.categoryPath.map((p) => String(p ?? '').trim()).filter((p) => p && !isPlaceholderCategoryName(p));
  }
  const parent = String(item.parentCategory ?? '').trim();
  const leaf = resolveCategoryLabelFromItem(item);
  if (parent && leaf && !isPlaceholderCategoryName(parent) && parent.toLowerCase() !== leaf.toLowerCase()) {
    if (leaf.includes(' · ')) {
      const parts = leaf.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) return parts;
    }
    return [parent, leaf];
  }
  if (leaf && leaf.includes(' · ')) {
    return leaf.split(/\s*·\s*/).map((s) => s.trim()).filter(Boolean);
  }
  return leaf ? [leaf] : [];
}

/**
 * Recompute draft.preview.categories from items grouped by real category names.
 * Items without a name merge into "Other". Never emits cat_N display names.
 * Preserves parentName / path / level when categoryPath depth ≥ 2.
 * @param {object[]} items
 * @returns {{ categories: { id: string, name: string, parentName?: string, level?: number, path?: string[] }[], items: object[] }}
 */
export function recomputeDraftCategoriesFromItems(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return { categories: [], items: [] };
  }

  /** @type {Map<string, { name: string, parentName?: string, level: number, path: string[], productIds: string[] }>} */
  const byKey = new Map();
  items.forEach((p, idx) => {
    const path = resolveCategoryPathFromItem(p);
    const leaf = path.length ? path[path.length - 1] : 'Other';
    const key = path.length ? path.map((s) => s.toLowerCase()).join('>') : 'other';
    if (!byKey.has(key)) {
      byKey.set(key, {
        name: leaf,
        parentName: path.length >= 2 ? path[0] : undefined,
        level: Math.max(0, path.length - 1),
        path: path.length ? path : ['Other'],
        productIds: [],
      });
    }
    byKey.get(key).productIds.push(p.id || `item_${idx}`);
  });

  const keyToId = new Map();
  const categories = Array.from(byKey.entries()).map(([key, meta]) => {
    const id =
      key === 'other' || meta.name.toLowerCase() === 'other'
        ? 'other'
        : `cat_${slugifyCategoryId(meta.path.join('_'))}`;
    keyToId.set(key, id);
    return {
      id,
      name: meta.name,
      ...(meta.parentName ? { parentName: meta.parentName } : {}),
      level: meta.level,
      path: meta.path,
    };
  });

  const itemsWithCategoryId = items.map((p, idx) => {
    const path = resolveCategoryPathFromItem(p);
    const key = path.length ? path.map((s) => s.toLowerCase()).join('>') : 'other';
    const label = path.length ? path.join(' · ') : 'Other';
    const leaf = path.length ? path[path.length - 1] : 'Other';
    return {
      ...p,
      id: p.id || `item_${idx}`,
      categoryId: keyToId.get(key) || 'other',
      ...(path.length ? { categoryPath: path } : {}),
      ...(label !== 'Other' ? { category: leaf, categoryName: leaf } : {}),
      ...(path.length >= 2 ? { parentCategory: path[0] } : {}),
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
