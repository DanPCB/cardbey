/**
 * Ops image service: detect-mismatch (read-only) and rebind-by-stable-key.
 * Uses same stable-key semantics as dashboard itemImageMapping (id > sku > composite(name|categoryId|price)).
 * Does not change DraftStore status; does not touch kernel.
 */

function normalize(s) {
  if (s == null) return '';
  const t = String(s).trim().toLowerCase();
  return t.replace(/\s+/g, ' ');
}

function getItemStableKey(item) {
  if (!item) return '';
  if (item.id && String(item.id).trim()) return String(item.id).trim();
  if (item.sku && String(item.sku).trim()) return `sku:${String(item.sku).trim()}`;
  if (item.externalId && String(item.externalId).trim()) return `ext:${String(item.externalId).trim()}`;
  const name = normalize(item.name);
  const cat = normalize(item.categoryId);
  const price = normalize(item.price);
  return `${name}|${cat}|${price}`;
}

function buildImageByStableKey(items) {
  const map = new Map();
  for (const item of items || []) {
    const url = item.imageUrl ?? (Array.isArray(item.images) && item.images[0] ? item.images[0] : null);
    if (url && String(url).trim()) {
      const key = getItemStableKey(item);
      if (key) map.set(key, String(url).trim());
    }
  }
  return map;
}

/**
 * Detect mismatches: items whose current imageUrl/images[0] differs from canonical imageByStableKey for their key.
 * @param {object} draft - DraftStore record with preview
 * @returns {{ mismatches: Array<{ itemStableKey, expectedImageKey?, actualImageKey?, reason, evidence }> }}
 */
export function detectMismatchesDraftStore(draft) {
  const mismatches = [];
  if (!draft?.preview || typeof draft.preview !== 'object') return { mismatches };
  const preview = draft.preview;
  const items = Array.isArray(preview.items) ? preview.items : Array.isArray(preview.catalog?.products) ? preview.catalog.products : [];
  const imageByStableKey = buildImageByStableKey(items);

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = getItemStableKey(item);
    if (!key) continue;
    const expectedUrl = imageByStableKey.get(key);
    const actualUrl = item.imageUrl ?? (Array.isArray(item.images) && item.images[0] ? item.images[0] : null);
    const actualTrimmed = actualUrl ? String(actualUrl).trim() : null;

    if (expectedUrl && actualTrimmed !== expectedUrl) {
      mismatches.push({
        itemStableKey: key,
        expectedImageKey: expectedUrl.slice(0, 80) + (expectedUrl.length > 80 ? '...' : ''),
        actualImageKey: actualTrimmed ? actualTrimmed.slice(0, 80) + (actualTrimmed.length > 80 ? '...' : '') : null,
        reason: actualTrimmed ? 'wrong_image_for_key' : 'missing_image',
        evidence: { itemId: item.id, itemName: item.name, index: i },
      });
    }
  }
  return { mismatches };
}

/**
 * Rebind: propose or apply correct imageUrl per item from imageByStableKey. Only updates preview.items[].imageUrl (no status change).
 * @param {object} draft - DraftStore record
 * @param {boolean} dryRun
 * @returns {{ changes: Array<{ itemStableKey, from, to }>, applied: boolean }}
 */
export function rebindDraftStoreByStableKey(draft, dryRun) {
  const changes = [];
  if (!draft?.preview || typeof draft.preview !== 'object') return { changes, applied: false };
  const preview = draft.preview;
  const items = Array.isArray(preview.items) ? preview.items : Array.isArray(preview.catalog?.products) ? preview.catalog.products : [];
  const imageByStableKey = buildImageByStableKey(items);

  for (const item of items) {
    const key = getItemStableKey(item);
    if (!key) continue;
    const correctUrl = imageByStableKey.get(key);
    const currentUrl = item.imageUrl ?? (Array.isArray(item.images) && item.images[0] ? item.images[0] : null);
    const currentTrimmed = currentUrl ? String(currentUrl).trim() : null;
    if (correctUrl && currentTrimmed !== correctUrl) {
      changes.push({
        itemStableKey: key,
        from: currentTrimmed || null,
        to: correctUrl,
      });
    }
  }

  if (!dryRun && changes.length > 0) {
    const itemsCopy = JSON.parse(JSON.stringify(items));
    const keyToUrl = new Map(changes.map((c) => [c.itemStableKey, c.to]));
    for (const item of itemsCopy) {
      const key = getItemStableKey(item);
      if (keyToUrl.has(key)) {
        item.imageUrl = keyToUrl.get(key);
        if (Array.isArray(item.images)) item.images[0] = keyToUrl.get(key);
      }
    }
    const newPreview = JSON.parse(JSON.stringify(preview));
    if (Array.isArray(preview.items)) newPreview.items = itemsCopy;
    if (newPreview.catalog && Array.isArray(newPreview.catalog.products)) newPreview.catalog.products = itemsCopy;
    return { changes, applied: true, newPreview };
  }
  return { changes, applied: false };
}
