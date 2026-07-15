/**
 * Validate draft/preview catalog hierarchy before finalize/publish.
 * Does not silently flatten on failure — returns structured failure codes.
 */

/**
 * @typedef {{ id: string, name: string, parentName?: string, parentId?: string|null, level?: number, path?: string[] }} CatalogCategoryRow
 * @typedef {{ id?: string, name?: string, categoryId?: string|null, categoryPath?: string[] }} CatalogItemRow
 */

/**
 * @param {{ categories?: CatalogCategoryRow[], items?: CatalogItemRow[] }} catalog
 * @returns {{ ok: boolean, failureCodes: string[], stats: object }}
 */
export function validateCatalogHierarchy(catalog) {
  const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  /** @type {string[]} */
  const failureCodes = [];

  const byId = new Map();
  for (const cat of categories) {
    if (!cat || typeof cat !== 'object') continue;
    const id = String(cat.id ?? '').trim();
    if (!id) continue;
    byId.set(id, cat);
  }

  let unassignedItemCount = 0;
  for (const item of items) {
    const cid = item?.categoryId != null ? String(item.categoryId).trim() : '';
    if (!cid || !byId.has(cid)) {
      unassignedItemCount += 1;
      failureCodes.push('CATALOG_ITEM_UNASSIGNED');
    }
  }

  for (const cat of categories) {
    const parentId = cat?.parentId != null ? String(cat.parentId).trim() : '';
    if (parentId && !byId.has(parentId)) {
      failureCodes.push('CATALOG_CATEGORY_PARENT_MISSING');
    }
  }

  // Cycle detection when parentId edges exist
  for (const cat of categories) {
    const start = String(cat?.id ?? '').trim();
    if (!start) continue;
    const seen = new Set();
    let cur = start;
    while (cur) {
      if (seen.has(cur)) {
        failureCodes.push('CATALOG_CATEGORY_CYCLE');
        break;
      }
      seen.add(cur);
      const node = byId.get(cur);
      cur = node?.parentId != null ? String(node.parentId).trim() : '';
      if (!cur) break;
    }
  }

  for (const cat of categories) {
    if (cat?.level != null && (!Number.isFinite(Number(cat.level)) || Number(cat.level) < 0)) {
      failureCodes.push('CATALOG_CATEGORY_LEVEL_INVALID');
    }
    if (Array.isArray(cat?.path) && cat.path.length && cat.level != null) {
      if (Number(cat.level) !== Math.max(0, cat.path.length - 1)) {
        failureCodes.push('CATALOG_CATEGORY_LEVEL_INVALID');
      }
    }
  }

  // Count items via path leaf buckets vs items length when categories present
  if (categories.length === 0 && items.length > 0) {
    failureCodes.push('CATALOG_CATEGORY_MISSING');
  }

  const uniqueCodes = [...new Set(failureCodes)];
  const maxDepth = categories.reduce((m, c) => {
    const d = Array.isArray(c?.path) ? c.path.length : Number(c?.level) + 1 || 1;
    return Math.max(m, d);
  }, 0);

  return {
    ok: uniqueCodes.length === 0,
    failureCodes: uniqueCodes,
    stats: {
      categoryCount: categories.length,
      itemCount: items.length,
      unassignedItemCount,
      maxDepth,
    },
  };
}
