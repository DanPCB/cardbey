/**
 * Content library types and constants (core).
 */

/** @typedef {'image' | 'video' | 'audio' | 'document' | '3d' | 'other' | 'logo' | 'icon'} AssetType */

/** @typedef {'showreel' | 'gallery' | 'campaign' | 'menu' | 'hero' | 'custom'} CollectionType */

/** @typedef {'grid' | 'carousel' | 'masonry' | 'single'} CollectionLayout */

/** @typedef {'user_uploaded' | 'ai_generated' | 'imported' | 'pixabay' | 'freesound' | 'cardbey' | 'svgrepo' | 'brandfetch'} AssetSource */

export const ASSET_TYPES = /** @type {const} */ ([
  'image',
  'video',
  'audio',
  'document',
  '3d',
  'other',
  'logo',
  'icon',
]);

export const COLLECTION_TYPES = /** @type {const} */ ([
  'showreel',
  'gallery',
  'campaign',
  'menu',
  'hero',
  'custom',
]);

export const DEFAULT_MAX_STORAGE_BYTES = 5 * 1024 * 1024 * 1024; // 5 GB per store

/**
 * @param {import('@prisma/client').ContentLibraryAsset} row
 */
export function mapAssetRow(row) {
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const tags = Array.isArray(row.tags) ? row.tags.map(String) : [];
  return {
    id: row.id,
    storeId: row.storeId,
    type: normalizeAssetType(row.type, row.format, meta),
    name: row.name,
    description: typeof meta.description === 'string' ? meta.description : '',
    url: row.url,
    thumbnailUrl: typeof meta.thumbnailUrl === 'string' ? meta.thumbnailUrl : row.url,
    fileSize: Number(meta.fileSize) || 0,
    mimeType: typeof meta.mimeType === 'string' ? meta.mimeType : guessMimeFromFormat(row.format),
    dimensions: meta.dimensions && typeof meta.dimensions === 'object' ? meta.dimensions : undefined,
    duration: meta.duration != null ? Number(meta.duration) : undefined,
    tags,
    metadata: meta,
    source: row.source || 'user_uploaded',
    license: row.license,
    format: row.format,
    sourceUrl: row.sourceUrl,
    usageCount: row.usageCount,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

/**
 * @param {import('@prisma/client').ContentLibraryCollection} row
 */
export function mapCollectionRow(row) {
  const assets = Array.isArray(row.assets) ? row.assets.map(String) : [];
  const meta = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  return {
    id: row.id,
    storeId: row.storeId,
    name: row.name,
    description: row.description ?? '',
    type: row.type,
    assets,
    layout: row.layout,
    metadata: meta,
    published: row.published === true,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    updatedAt: row.updatedAt?.toISOString?.() ?? row.updatedAt,
  };
}

/**
 * @param {string} mimetype
 * @param {string} filename
 * @returns {AssetType}
 */
export function detectAssetType(mimetype, filename) {
  const ext = String(filename || '').toLowerCase();
  const mime = String(mimetype || '').toLowerCase();
  if (mime.startsWith('image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some((e) => ext.endsWith(e))) {
    return 'image';
  }
  if (mime.startsWith('video/') || ['.mp4', '.webm', '.mov', '.avi'].some((e) => ext.endsWith(e))) {
    return 'video';
  }
  if (mime.startsWith('audio/') || ['.mp3', '.wav', '.ogg', '.flac'].some((e) => ext.endsWith(e))) {
    return 'audio';
  }
  if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.csv', '.txt'].some((e) => ext.endsWith(e))) {
    return 'document';
  }
  return 'other';
}

function normalizeAssetType(type, format, meta) {
  const t = String(type || '').toLowerCase();
  if (ASSET_TYPES.includes(/** @type {any} */ (t))) return t;
  if (t === 'brand_kit') return 'image';
  if (format === 'mp4' || meta?.mediaKind === 'video') return 'video';
  if (format === 'mp3' || meta?.mediaKind === 'audio') return 'audio';
  return 'image';
}

function guessMimeFromFormat(format) {
  const f = String(format || '').toLowerCase();
  if (f === 'svg') return 'image/svg+xml';
  if (f === 'webp') return 'image/webp';
  if (f === 'png') return 'image/png';
  if (f === 'mp4') return 'video/mp4';
  if (f === 'mp3') return 'audio/mpeg';
  if (f === 'pdf') return 'application/pdf';
  return 'application/octet-stream';
}

/**
 * @param {ReturnType<typeof mapAssetRow>[]} assets
 */
export function sumAssetStorage(assets) {
  return assets.reduce((sum, a) => sum + (Number(a.fileSize) || 0), 0);
}
