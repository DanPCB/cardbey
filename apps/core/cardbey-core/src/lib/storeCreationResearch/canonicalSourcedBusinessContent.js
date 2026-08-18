/**
 * Minimal sourced-content helpers for preview category normalization bypass.
 * Full envelope lives historically with Design Library; P0 keeps draftStoreService loading
 * without requiring the full DL stack on this branch.
 */

/**
 * Rebuild preview.categories from item categoryName / categoryId (sourced path).
 * @param {object} preview
 * @returns {object}
 */
export function syncCategoriesFromSourcedItems(preview) {
  if (!preview || typeof preview !== 'object') return preview;
  const items = Array.isArray(preview.items) ? preview.items : [];
  if (!items.length) return preview;

  const map = new Map();
  let idx = 0;
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    let cname = String(it.categoryName ?? it.category ?? '').trim();
    if (!cname) {
      const role = String(it.contentRole ?? it.role ?? '').toLowerCase();
      cname = role.startsWith('menu')
        ? 'Menu'
        : role.startsWith('product')
          ? 'Products'
          : role.startsWith('service')
            ? 'Services'
            : 'Offerings';
    }
    if (!map.has(cname)) {
      const existingId = String(it.categoryId ?? '').trim();
      const id =
        existingId && existingId.toLowerCase() !== 'other' && ![...map.values()].some((c) => c.id === existingId)
          ? existingId
          : `src_cat_${idx++}`;
      map.set(cname, { id, name: cname });
    }
    const cat = map.get(cname);
    it.categoryId = cat.id;
    if (!it.categoryName) it.categoryName = cat.name;
  }
  preview.categories = [...map.values()];
  return preview;
}

/**
 * When true, normalizePreviewCategories must not force an "Other" sink.
 * @param {object} preview
 * @returns {boolean}
 */
export function shouldBypassLegacyCategoryNormalization(preview) {
  if (!preview || typeof preview !== 'object') return false;
  const meta = preview.meta && typeof preview.meta === 'object' ? preview.meta : {};
  if (meta.designLibraryStorefrontProjection) return true;
  if (meta.bypassLegacyCategoryNormalization === true) return true;
  if (meta.groundedStoreCreation === true) return true;
  if (meta.catalogSource === 'grounded_evidence' || meta.catalogSource === 'ocr') return true;
  const authority = String(meta.catalogAuthority?.selectedAuthority ?? meta.catalogAuthority ?? '').trim();
  if (authority === 'sourced' || authority === 'sourced_pending_review') return true;
  if (meta.contentOrigin === 'sourced' && meta.catalogSource === 'research') return true;
  if (meta.canonicalSourcedContent?.version) return true;
  if (meta.offeringIncomplete) return true;
  return false;
}

/**
 * @param {Record<string, unknown>} payload
 */
export function emitStoreCreationAuthorityTrace(payload) {
  const event = {
    event: 'store.creation.authority_trace',
    ...payload,
    at: new Date().toISOString(),
  };
  if (process.env.NODE_ENV !== 'production' || process.env.LOG_STORE_CREATION_AUTHORITY_TRACE === '1') {
    try {
      console.info('[store.creation.authority_trace]', JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
}
