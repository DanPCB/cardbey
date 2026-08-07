/**
 * Map any adapter hit → Unified Resource fields for the Resource Index.
 * Binaries are never stored here.
 */

import {
  COMMERCIAL_LICENSE_STATE,
  CUSTODY_MODE,
  RESOURCE_CLASS,
  RESOURCE_KIND,
} from '../types.js';

/**
 * @param {object} hit — raw adapter search hit
 * @param {object} ctx
 * @param {string} ctx.sourceId
 * @param {string} [ctx.resourceClass]
 * @param {string} [ctx.industry]
 */
export function normalizeAdapterHit(hit, ctx = {}) {
  if (!hit || typeof hit !== 'object') return null;

  const kind = normalizeKind(hit.kind || hit.mediaType || hit.type);
  const custodyMode =
    hit.custodyMode ||
    hit.defaultCustody ||
    (ctx.resourceClass === RESOURCE_CLASS.CREATIVE_PLATFORM
      ? CUSTODY_MODE.REFERENCE_ONLY
      : CUSTODY_MODE.PROVIDER_HOSTED);

  return {
    sourceId: ctx.sourceId || hit.sourceId,
    remoteId: String(hit.remoteId || hit.id || ''),
    canonicalUrl: hit.canonicalUrl || hit.sourcePageUrl || hit.url || null,
    previewUrl: hit.previewUrl || hit.thumbnailUrl || hit.thumbUrl || null,
    title: hit.title || hit.alt || hit.description || null,
    mediaType: kind,
    kind,
    resourceClass: ctx.resourceClass || hit.resourceClass || RESOURCE_CLASS.OPEN_MEDIA,
    industry: hit.industry || ctx.industry || null,
    sourceMetadata: {
      provider: hit.provider || ctx.sourceId,
      photographer: hit.photographer || hit.creator || hit.author || null,
      photographerUrl: hit.photographerUrl || hit.creatorUrl || null,
      license: hit.license || hit.licenseNote || null,
      attributionText: hit.attributionText || hit.attribution || null,
      width: hit.width || null,
      height: hit.height || null,
      durationSec: hit.durationSec || null,
      tags: hit.tags || [],
      ...(hit.sourceMetadata || {}),
    },
    provenance: {
      system: 'provider_federation',
      provider: hit.provider || ctx.sourceId,
      discoveredAt: new Date().toISOString(),
      adapter: true,
      ...(hit.provenance || {}),
    },
    rightsSnapshot: {
      status: hit.rightsStatus || 'SUGGESTED',
      license: hit.license || null,
      commercialLicenseState:
        hit.commercialLicenseState || COMMERCIAL_LICENSE_STATE.NOT_APPLICABLE,
      policyPending: true,
      authority: 'rights_intelligence_interface',
      ...(hit.rightsSnapshot || {}),
    },
    qualitySnapshot: {
      score: hit.qualityScore ?? null,
      ...(hit.qualitySnapshot || {}),
    },
    technical: {
      hostingMode: custodyMode === CUSTODY_MODE.REFERENCE_ONLY ? 'REFERENCE' : 'PROVIDER_HOSTED',
      custodyMode,
      mimeType: hit.mimeType || null,
      downloadUrl: hit.downloadUrl || hit.fullUrl || hit.url || null,
      ...(hit.technical || {}),
    },
    availability: {
      available: hit.available !== false,
      mode: 'provider_federation',
      ...(hit.availability || {}),
    },
    relationships: hit.relationships || [],
    embeddingRef: hit.embeddingRef || null,
    binaryStored: false,
  };
}

function normalizeKind(raw) {
  const k = String(raw || 'other').toLowerCase();
  if (k === 'photo' || k === 'image' || k === 'jpg' || k === 'jpeg' || k === 'png') {
    return RESOURCE_KIND.IMAGE;
  }
  if (k === 'video' || k === 'mp4') return RESOURCE_KIND.VIDEO;
  if (k === 'audio' || k === 'music' || k === 'mp3') return RESOURCE_KIND.AUDIO;
  if (Object.values(RESOURCE_KIND).includes(k)) return k;
  return RESOURCE_KIND.OTHER;
}
