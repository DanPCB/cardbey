/**
 * Track selected images within a store-generation run to prevent duplicate reuse.
 */

/**
 * @param {string} url
 */
export function normalizeImageUrlKey(url) {
  try {
    const u = new URL(String(url).trim());
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return String(url ?? '').trim().split('?')[0];
  }
}

export class ServiceImageRegistry {
  constructor() {
    /** @type {Set<string>} */
    this.providerAssetIds = new Set();
    /** @type {Set<string>} */
    this.imageUrlKeys = new Set();
    /** @type {Map<string, string>} */
    this.canonicalServiceByAsset = new Map();
  }

  /**
   * @param {string} canonicalServiceKey
   * @param {{ providerAssetId?: string, imageUrl?: string }} candidate
   */
  isDuplicate(canonicalServiceKey, candidate) {
    const assetId = candidate.providerAssetId ? String(candidate.providerAssetId) : '';
    if (assetId && this.providerAssetIds.has(assetId)) {
      const owner = this.canonicalServiceByAsset.get(assetId);
      if (owner && owner !== canonicalServiceKey) return true;
    }
    const urlKey = candidate.imageUrl ? normalizeImageUrlKey(candidate.imageUrl) : '';
    if (urlKey && this.imageUrlKeys.has(urlKey)) return true;
    return false;
  }

  /**
   * @param {string} canonicalServiceKey
   * @param {{ providerAssetId?: string, imageUrl?: string }} selected
   */
  register(canonicalServiceKey, selected) {
    if (selected.providerAssetId) {
      const id = String(selected.providerAssetId);
      this.providerAssetIds.add(id);
      this.canonicalServiceByAsset.set(id, canonicalServiceKey);
    }
    if (selected.imageUrl) {
      this.imageUrlKeys.add(normalizeImageUrlKey(selected.imageUrl));
    }
  }
}
