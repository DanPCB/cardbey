/**
 * Build CatalogBuildResult-shaped object from preflight rows (Mission.context.preloadedCatalogItems).
 * @param {Array<{ name?: string; price?: number; category?: string }>} rawItems
 * @param {{ businessName?: string|null; verticalSlug?: string|null; currencyCode?: string|null }} opts
 */
export function buildCatalogFromPreloadedItems(rawItems, opts = {}) {
  const businessName = opts.businessName != null ? String(opts.businessName) : '';
  const verticalSlug = opts.verticalSlug != null ? String(opts.verticalSlug) : null;
  const currencyCode =
    opts.currencyCode != null && String(opts.currencyCode).trim()
      ? String(opts.currencyCode).trim().toUpperCase()
      : 'AUD';
  const list = Array.isArray(rawItems) ? rawItems : [];
  const categoriesMap = new Map();
  let idx = 0;
  for (const it of list) {
    const cn = String(it?.category || 'Services').trim() || 'Services';
    if (!categoriesMap.has(cn)) {
      categoriesMap.set(cn, { id: `pre_cat_${idx++}`, name: cn });
    }
  }
  if (categoriesMap.size === 0) {
    categoriesMap.set('Services', { id: 'pre_cat_services', name: 'Services' });
  }
  const categories = [...categoriesMap.values()];
  const products = list.map((it, i) => {
    const cname = String(it?.category || 'Services').trim() || 'Services';
    const cat = categoriesMap.get(cname) || categories[0];
    const priceRaw = it?.price;
    const price =
      typeof priceRaw === 'number' && Number.isFinite(priceRaw)
        ? priceRaw
        : typeof priceRaw === 'string' && Number.isFinite(Number(priceRaw))
          ? Number(priceRaw)
          : 0;
    const nm = String(it?.name || `Service ${i + 1}`).trim();
    return {
      id: `pre_item_${i}`,
      productId: `preloaded_${i}`,
      name: nm,
      title: nm,
      description: '',
      price,
      currency: currencyCode,
      categoryId: cat.id,
    };
  });
  const trimmedName = businessName.trim();
  return {
    profile: {
      name: trimmedName || undefined,
      tagline: trimmedName || businessName,
    },
    categories,
    products,
    meta: { catalogSource: 'user_upload', vertical: verticalSlug, currencyCode },
  };
}

/**
 * @param {unknown} body
 * @returns {object[]|null}
 */
export function sanitizePreloadedCatalogItems(body) {
  if (body == null || !Array.isArray(body)) return null;
  const out = [];
  for (const it of body) {
    if (!it || typeof it !== 'object') continue;
    const name = typeof it.name === 'string' ? it.name.trim() : '';
    if (!name) continue;
    const price = typeof it.price === 'number' && Number.isFinite(it.price) ? it.price : Number(it.price) || 0;
    const category = typeof it.category === 'string' ? it.category.trim() : 'Services';
    out.push({ name, price, category, source: typeof it.source === 'string' ? it.source : 'pdf_preflight' });
    if (out.length >= 200) break;
  }
  return out.length ? out : null;
}
