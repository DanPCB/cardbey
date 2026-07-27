/**
 * Attachment analysis cache — keyed by content hash + analyzer version (no raw base64 stored).
 */

import { createHash } from 'node:crypto';

export const ATTACHMENT_ANALYZER_VERSION = 'aa-v1';

const MAX_ENTRIES = 64;

/** @type {Map<string, { evidenceId: string | null; ocrTextRef: string | null; documentType: string | null; topologyResult: unknown; confidence: number; attachmentAnalysis: Record<string, unknown>; completedAt: string }>} */
const cache = new Map();

/**
 * @param {string | null | undefined} imageRef
 * @returns {string | null}
 */
export function hashAttachmentContent(imageRef) {
  const ref = String(imageRef ?? '').trim();
  if (!ref) return null;
  return createHash('sha256').update(ref).digest('hex');
}

/**
 * @param {string | null | undefined} imageRef
 * @returns {string | null}
 */
export function buildAttachmentCacheKey(imageRef) {
  const hash = hashAttachmentContent(imageRef);
  if (!hash) return null;
  return `${ATTACHMENT_ANALYZER_VERSION}:${hash}`;
}

/**
 * @param {string} cacheKey
 */
export function getCachedAttachmentAnalysis(cacheKey) {
  if (!cacheKey) return null;
  const hit = cache.get(cacheKey);
  if (!hit) return null;
  cache.delete(cacheKey);
  cache.set(cacheKey, hit);
  return hit;
}

/**
 * @param {string} cacheKey
 * @param {Record<string, unknown>} entry
 */
export function setCachedAttachmentAnalysis(cacheKey, entry) {
  if (!cacheKey || !entry || typeof entry !== 'object') return;
  if (cache.has(cacheKey)) cache.delete(cacheKey);
  cache.set(cacheKey, {
    evidenceId: entry.evidenceId != null ? String(entry.evidenceId) : null,
    ocrTextRef: entry.ocrTextRef != null ? String(entry.ocrTextRef) : null,
    documentType: entry.documentType != null ? String(entry.documentType) : null,
    topologyResult: entry.topologyResult ?? null,
    confidence: Number(entry.confidence) || 0,
    attachmentAnalysis: sanitizeAnalysisForCache(entry.attachmentAnalysis),
    completedAt: entry.completedAt ?? new Date().toISOString(),
  });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
}

/**
 * @param {unknown} analysis
 */
function sanitizeAnalysisForCache(analysis) {
  if (!analysis || typeof analysis !== 'object' || Array.isArray(analysis)) return {};
  const copy = { ...analysis };
  for (const key of ['imageDataUrl', 'dataUrl', 'previewDataUrl', 'base64', 'rawBytes']) {
    if (key in copy) delete copy[key];
  }
  return copy;
}

export function getAttachmentCacheDiagnostics() {
  let bytes = 0;
  for (const entry of cache.values()) {
    try {
      bytes += Buffer.byteLength(JSON.stringify(entry), 'utf8');
    } catch {
      /* ignore */
    }
  }
  return { attachmentCacheEntries: cache.size, attachmentCacheBytes: bytes };
}

export function __clearAttachmentAnalysisCacheForTests() {
  cache.clear();
}
