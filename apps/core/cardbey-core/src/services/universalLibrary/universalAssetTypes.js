/**
 * Universal Library asset enums and helpers.
 */

export const ASSET_TYPE = Object.freeze({
  VIDEO: 'video',
  IMAGE: 'image',
  AUDIO: 'audio',
  TEMPLATE: 'template',
  ARTICLE: 'article',
  DOCUMENT: 'document',
  ICON: 'icon',
  ANIMATION: 'animation',
  BUNDLE: 'bundle',
  OTHER: 'other',
});

export const ASSET_PROVIDER = Object.freeze({
  CARDBEY_INTERNAL: 'cardbey_internal',
  CREATOR_STUDIO: 'creator_studio',
  SEED: 'seed',
  YOUTUBE: 'youtube', // reference metadata only — no ingest without rights
  PEXELS: 'pexels',
  PIXABAY: 'pixabay',
  UNSPLASH: 'unsplash',
  WIKIMEDIA: 'wikimedia',
  INTERNET_ARCHIVE: 'internet_archive',
  OPENVERSE: 'openverse',
});

export const RIGHTS_STATUS = Object.freeze({
  CLEARED: 'CLEARED',
  UNKNOWN: 'UNKNOWN',
  RESTRICTED: 'RESTRICTED',
  REJECTED: 'REJECTED',
});

export const HOSTING_MODE = Object.freeze({
  HOSTED: 'HOSTED',
  REFERENCE: 'REFERENCE',
  EXTERNAL: 'EXTERNAL',
});

export const ASSET_STATUS = Object.freeze({
  DISCOVERED: 'DISCOVERED',
  NORMALIZED: 'NORMALIZED',
  CLASSIFIED: 'CLASSIFIED',
  RIGHTS_PENDING: 'RIGHTS_PENDING',
  DUPLICATE: 'DUPLICATE',
  MODERATION: 'MODERATION',
  PUBLISHED: 'PUBLISHED',
  FAILED: 'FAILED',
  REJECTED: 'REJECTED',
  ARCHIVED: 'ARCHIVED',
  /** Library projection withdrawn by creator — preserves provenance in metadata. */
  WITHDRAWN: 'WITHDRAWN',
});

export const ASSET_RELATION_TYPE = Object.freeze({
  BELONGS_TO: 'belongs_to',
  CREATED_BY: 'created_by',
  SOLD_BY: 'sold_by',
  MENTIONS: 'mentions',
  SIMILAR_TO: 'similar_to',
  INSPIRED_BY: 'inspired_by',
  LOCATED_IN: 'located_in',
  USED_BY: 'used_by',
  RECOMMENDED_WITH: 'recommended_with',
  PART_OF_COLLECTION: 'part_of_collection',
});

export const JOB_KIND = Object.freeze({
  DISCOVERY: 'DISCOVERY',
  PROVIDER_SYNC: 'PROVIDER_SYNC',
  MODERATION: 'MODERATION',
  PUBLISH: 'PUBLISH',
  PIPELINE: 'PIPELINE',
});

export const JOB_STATUS = Object.freeze({
  QUEUED: 'QUEUED',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
});

export const PIPELINE_STAGE = Object.freeze({
  DISCOVER: 'discover',
  NORMALIZE: 'normalize',
  CLASSIFY: 'classify',
  RIGHTS: 'rights',
  DEDUPE: 'dedupe',
  MODERATION: 'moderation',
  PUBLISH: 'publish',
});

export const ENTITY_KIND = Object.freeze({
  STORE: 'Store',
  CREATOR: 'Creator',
  BRAND: 'Brand',
  LOCATION: 'Location',
  PRODUCT: 'Product',
  SERVICE: 'Service',
  ARTICLE: 'Article',
  VIDEO: 'Video',
  IMAGE: 'Image',
  AUDIO: 'Audio',
  COLLECTION: 'Collection',
  TOPIC: 'Topic',
  CATEGORY: 'Category',
});

export const ENTITY_RELATION_TYPE = Object.freeze({
  PART_OF: 'part_of',
  RELATED_TO: 'related_to',
  LOCATED_IN: 'located_in',
  CREATED_BY: 'created_by',
  TAGGED_WITH: 'tagged_with',
});

const KNOWN_ASSET_TYPES = new Set(Object.values(ASSET_TYPE));
const KNOWN_PIPELINE_STAGES = new Set(Object.values(PIPELINE_STAGE));

/**
 * @param {string} type
 */
export function isKnownAssetType(type) {
  return KNOWN_ASSET_TYPES.has(String(type ?? '').toLowerCase());
}

/**
 * @param {string} stage
 */
export function isKnownPipelineStage(stage) {
  return KNOWN_PIPELINE_STAGES.has(String(stage ?? '').toLowerCase());
}

/**
 * Fail-closed publish gate — rights cleared and owner present.
 * @param {object} asset
 */
export function canPublishAsset(asset) {
  if (!asset) return false;
  const rights = String(asset.rightsStatus ?? '').toUpperCase();
  const ownerId = String(asset.ownerId ?? '').trim();
  return rights === RIGHTS_STATUS.CLEARED && ownerId.length > 0;
}

/**
 * @param {unknown} value
 * @returns {string[]}
 */
export function normalizeStringArray(value) {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value.split(',').map((v) => v.trim()).filter(Boolean);
  }
  return [];
}
