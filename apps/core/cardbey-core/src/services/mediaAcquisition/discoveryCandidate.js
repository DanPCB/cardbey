/**
 * Thin DiscoveryCandidate DTO — maps URI Unified Resource / adapter hits.
 * Not a second asset SSOT.
 */

import { resolveAcquisitionDecision } from './acquisitionDecision.js';

/**
 * @param {object} resource — normalizeAdapterHit / Resource Index record
 * @param {object} [scores]
 */
export function toDiscoveryCandidate(resource, scores = {}) {
  if (!resource || typeof resource !== 'object') return null;

  const provider = String(
    resource.sourceMetadata?.provider ||
      resource.provenance?.provider ||
      resource.sourceId ||
      '',
  )
    .replace(/^src_/, '')
    .toLowerCase();

  const providerAssetId = String(resource.remoteId || resource.id || '').trim();
  const license = resource.sourceMetadata?.license || resource.rightsSnapshot?.license || null;
  const attributionText =
    resource.sourceMetadata?.attributionText || resource.sourceMetadata?.attribution || null;

  const decision = resolveAcquisitionDecision({
    provider,
    sourceId: resource.sourceId || `src_${provider}`,
    license,
    attributionText,
    // Let policy infer attribution from license; do not force on courtesy credit text
  });

  const mediaType = normalizeMediaType(resource.mediaType || resource.kind);
  const width = resource.sourceMetadata?.width ?? null;
  const height = resource.sourceMetadata?.height ?? null;
  const duration = resource.sourceMetadata?.durationSec ?? resource.sourceMetadata?.duration ?? null;

  const relevanceScore =
    scores.relevanceScore != null ? Number(scores.relevanceScore) : scoreRelevance(resource, scores);
  const qualityScore =
    scores.qualityScore != null ? Number(scores.qualityScore) : scoreQuality(resource, mediaType);

  const id = `dc_${provider}_${providerAssetId}`.replace(/[^a-zA-Z0-9_-]/g, '_');

  return {
    id,
    provider,
    providerAssetId,
    sourceUrl: resource.canonicalUrl || null,
    mediaType,
    mimeType: resource.technical?.mimeType || null,
    previewUrl: resource.previewUrl || null,
    providerHostedUrl:
      resource.technical?.downloadUrl ||
      resource.availability?.url ||
      resource.previewUrl ||
      null,
    downloadUrl: resource.technical?.downloadUrl || null,
    title: resource.title || `${provider} ${providerAssetId}`,
    description: resource.description || null,
    creator: resource.sourceMetadata?.photographer || resource.sourceMetadata?.creator || null,
    license,
    licenseUrl: resource.sourceMetadata?.licenseUrl || null,
    commercialUse: decision.commercialUse,
    derivativesAllowed: decision.derivativesAllowed,
    attributionRequired: decision.attributionRequired,
    attributionText,
    width,
    height,
    duration,
    tags: Array.isArray(resource.sourceMetadata?.tags) ? resource.sourceMetadata.tags : [],
    industryTags: resource.industry ? [String(resource.industry)] : [],
    language: resource.sourceMetadata?.language || null,
    sourceMetadata: {
      ...(resource.sourceMetadata || {}),
      uriResourceId: resource.id || null,
      resourceClass: resource.resourceClass || null,
      rightsSnapshot: resource.rightsSnapshot || null,
    },
    relevanceScore,
    qualityScore,
    rightsConfidence: decision.rightsConfidence,
    retrievedAt: resource.provenance?.discoveredAt || new Date().toISOString(),
    acquisitionDecision: decision.decision,
    custodyMode: decision.custodyMode,
    reviewStatus: decision.reviewStatus,
    canAcquire: decision.canAcquire,
    canDownload: decision.canDownload,
    decisionReason: decision.reason,
    publishable: false,
  };
}

function normalizeMediaType(raw) {
  const k = String(raw || 'other').toLowerCase();
  if (['photo', 'image', 'jpg', 'jpeg', 'png', 'webp'].includes(k)) return 'image';
  if (['video', 'mp4'].includes(k)) return 'video';
  if (['audio', 'music', 'mp3', 'wav'].includes(k)) return 'audio';
  if (['document', 'pdf', 'article'].includes(k)) return 'document';
  return k || 'other';
}

function scoreRelevance(resource, scores) {
  const q = String(scores.query || '').toLowerCase();
  if (!q) return 50;
  const title = String(resource.title || '').toLowerCase();
  const tags = (resource.sourceMetadata?.tags || []).join(' ').toLowerCase();
  let score = 40;
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);
  for (const t of tokens) {
    if (title.includes(t)) score += 12;
    else if (tags.includes(t)) score += 6;
  }
  if (scores.mediaType && normalizeMediaType(resource.mediaType) === scores.mediaType) {
    score += 10;
  }
  return Math.min(100, score);
}

function scoreQuality(resource, mediaType) {
  let score = 40;
  const w = Number(resource.sourceMetadata?.width) || 0;
  const h = Number(resource.sourceMetadata?.height) || 0;
  if (mediaType === 'image' || mediaType === 'video') {
    if (w >= 1920 || h >= 1080) score += 30;
    else if (w >= 1280 || h >= 720) score += 20;
    else if (w >= 640) score += 10;
  }
  if (resource.previewUrl) score += 15;
  if (resource.technical?.downloadUrl || resource.canonicalUrl) score += 10;
  if (resource.sourceMetadata?.license) score += 5;
  return Math.min(100, score);
}

/**
 * Dedupe candidates: provider+id → sourceUrl → title/creator secondary only.
 * @param {object[]} candidates
 */
export function dedupeDiscoveryCandidates(candidates = []) {
  const byKey = new Map();
  const byUrl = new Map();

  for (const c of candidates) {
    if (!c) continue;
    const primary = `${c.provider}::${c.providerAssetId}`.toLowerCase();
    if (c.providerAssetId && byKey.has(primary)) continue;

    const urlKey = normalizeUrl(c.sourceUrl || c.providerHostedUrl);
    if (urlKey && byUrl.has(urlKey)) {
      // Prefer higher rights confidence / quality
      const existing = byUrl.get(urlKey);
      if (
        (c.rightsConfidence || 0) + (c.qualityScore || 0) <=
        (existing.rightsConfidence || 0) + (existing.qualityScore || 0)
      ) {
        continue;
      }
      byKey.delete(`${existing.provider}::${existing.providerAssetId}`.toLowerCase());
    }

    if (c.providerAssetId) byKey.set(primary, c);
    if (urlKey) byUrl.set(urlKey, c);
  }

  return [...byKey.values()];
}

function normalizeUrl(url) {
  if (!url || typeof url !== 'string') return '';
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname}`.toLowerCase().replace(/\/$/, '');
  } catch {
    return String(url).toLowerCase().trim();
  }
}

/**
 * Rank by relevance then quality; never fold rights into rank as sole gate.
 * @param {object[]} candidates
 */
export function rankDiscoveryCandidates(candidates = []) {
  return [...candidates].sort((a, b) => {
    const ra = (a.relevanceScore || 0) * 0.55 + (a.qualityScore || 0) * 0.35;
    const rb = (b.relevanceScore || 0) * 0.55 + (b.qualityScore || 0) * 0.35;
    // Slight preference for clearer rights when relevance/quality close
    if (Math.abs(ra - rb) < 3) {
      return (b.rightsConfidence || 0) - (a.rightsConfidence || 0);
    }
    return rb - ra;
  });
}
