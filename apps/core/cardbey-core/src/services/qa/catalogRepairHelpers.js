/**
 * Catalog repair helpers — typed labels and per-item image repair.
 */

/**
 * @param {object} preview
 */
export function resolveCatalogItemLabel(preview) {
  const catalogKind =
    preview?.meta?.catalogKind ??
    preview?.meta?.businessCommerceProfile?.catalogKind ??
    'product';
  return catalogKind === 'service' ? 'services' : catalogKind === 'menu_item' ? 'menu_items' : 'products';
}

/**
 * @param {number} index
 * @param {object} preview
 */
export function catalogItemRef(index, preview) {
  return `${resolveCatalogItemLabel(preview)}[${index}]`;
}

/**
 * Regenerate images only for semantically mismatched service catalog items.
 * @param {object[]} items
 * @param {object} opts
 */
export async function repairSemanticImageMismatches(items, opts = {}) {
  const { evaluateItemImageSemantics } = await import('../qa/semanticCatalogQa.js');
  const { resolveServiceImageForItem, ServiceImageRegistry, shouldUseServiceImageResolver } = await import(
    '../media/serviceImageResolver.js'
  );

  if (!shouldUseServiceImageResolver(opts)) {
    return { repaired: [], patched: 0 };
  }

  const profile = opts.businessCommerceProfile ?? opts.generationProfile?.businessCommerceProfile;
  const registry = new ServiceImageRegistry();
  const repaired = [];
  let patched = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item?.name) continue;
    const evalResult = evaluateItemImageSemantics(item, profile);
    if (!evalResult.blocking && item.imageUrl) continue;

    console.log('[CatalogRepair] service image regenerated', {
      itemName: item.name,
      index: i,
      priorScore: evalResult.score,
    });

    const result = await resolveServiceImageForItem({
      serviceName: item.canonicalServiceTitle ?? item.name,
      description: item.description,
      businessCategory: opts.storeType,
      categoryName: item.category,
      location: opts.location,
      imageQueryHint: item.imageQueryHint,
      storeName: opts.storeName,
      registry,
      forceRetry: true,
      bypassSearchCache: true,
    });

    if (result?.url) {
      item.imageUrl = result.url;
      item.imageSelection = result.imageSelection;
      item.imageMatchStatus = result.imageMatchStatus;
      item.canonicalServiceTitle = result.canonicalServiceTitle;
      item.imageConfidence = result.confidence;
      repaired.push(`repaired ${catalogItemRef(i, opts.preview ?? {})}.image`);
      patched += 1;
    } else {
      item.imageUrl = null;
      item.imageMatchStatus = 'missing';
      repaired.push(`cleared ${catalogItemRef(i, opts.preview ?? {})}.image`);
    }
  }

  return { repaired, patched };
}
