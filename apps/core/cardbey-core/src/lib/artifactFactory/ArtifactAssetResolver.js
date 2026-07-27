/**
 * Universal asset resolver — store assets, uploads, R2, media library, generated, stock, external URLs.
 */

/**
 * @typedef {Object} ResolvedAsset
 * @property {string} id
 * @property {string} source
 * @property {string} kind
 * @property {string|null} url
 * @property {string|null} [thumbnailUrl]
 * @property {Record<string, unknown>} [metadata]
 */

/**
 * @param {import('./ArtifactContextResolver.js').ResolvedArtifactContext} ctx
 * @param {Record<string, unknown>} inputs
 * @returns {Promise<{ assets: ResolvedAsset[]; byRole: Record<string, ResolvedAsset[]> }>}
 */
export async function resolveArtifactAssets(ctx, inputs = {}) {
  /** @type {ResolvedAsset[]} */
  const assets = [];
  /** @type {Record<string, ResolvedAsset[]>} */
  const byRole = {};

  const push = (role, asset) => {
    assets.push(asset);
    if (!byRole[role]) byRole[role] = [];
    byRole[role].push(asset);
  };

  const addFromList = (role, list, source) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const o = /** @type {Record<string, unknown>} */ (item);
      const url = pickUrl(o);
      if (!url) continue;
      push(role, {
        id: String(o.id ?? o.assetId ?? `${role}-${assets.length}`),
        source,
        kind: String(o.kind ?? o.type ?? role),
        url,
        thumbnailUrl: typeof o.thumbnailUrl === 'string' ? o.thumbnailUrl : null,
        metadata: o,
      });
    }
  };

  addFromList('upload', inputs.uploads, 'upload');
  addFromList('upload', inputs.uploadedAssets, 'upload');
  addFromList('media_library', inputs.mediaLibrary, 'media_library');
  addFromList('generated', inputs.generatedAssets, 'generated');
  addFromList('stock', inputs.stockAssets, 'stock');
  addFromList('external', inputs.externalUrls, 'external');

  if (ctx.business?.logo) {
    push('logo', {
      id: 'store-logo',
      source: 'store',
      kind: 'image',
      url: String(ctx.business.logo),
      metadata: { field: 'logo' },
    });
  }
  if (ctx.business?.heroImage) {
    push('hero', {
      id: 'store-hero',
      source: 'store',
      kind: 'image',
      url: String(ctx.business.heroImage),
      metadata: { field: 'heroImage' },
    });
  }

  const ctxUploads = ctx.uploads;
  if (ctxUploads && typeof ctxUploads === 'object') {
    for (const [role, value] of Object.entries(ctxUploads)) {
      if (!value || typeof value !== 'object') continue;
      const url = pickUrl(/** @type {Record<string, unknown>} */ (value));
      if (!url) continue;
      push(role, {
        id: `ctx-${role}`,
        source: 'context',
        kind: role,
        url,
        metadata: /** @type {Record<string, unknown>} */ (value),
      });
    }
  }

  return { assets, byRole };
}

/**
 * @param {Record<string, unknown>} o
 */
function pickUrl(o) {
  for (const key of ['url', 'publicUrl', 'r2Url', 'src', 'href']) {
    if (typeof o[key] === 'string' && o[key].trim()) return o[key].trim();
  }
  return null;
}
