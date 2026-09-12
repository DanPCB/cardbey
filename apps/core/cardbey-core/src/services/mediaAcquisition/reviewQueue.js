/**
 * Durable review queue for media acquisition.
 * Survives Core process restart via atomic JSON file store (single-process V1).
 * API surface unchanged from the in-memory prototype.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAcquisitionDecision } from './acquisitionDecision.js';
import { recordMediaAcquisitionEvent } from './observability.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_STORE_PATH = path.resolve(
  __dirname,
  '../../../data/mediaAcquisition/review-queue.json',
);

/** @type {Map<string, object>} */
let queue = new Map();
let storePath = process.env.MEDIA_ACQUISITION_REVIEW_QUEUE_PATH || DEFAULT_STORE_PATH;
let hydrated = false;

function ensureHydrated() {
  if (hydrated) return;
  hydrated = true;
  loadFromDisk();
}

function loadFromDisk() {
  try {
    if (!fs.existsSync(storePath)) {
      queue = new Map();
      return;
    }
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    const items = Array.isArray(parsed?.items) ? parsed.items : [];
    queue = new Map();
    for (const item of items) {
      if (item?.reviewId) queue.set(String(item.reviewId), item);
    }
  } catch {
    queue = new Map();
  }
}

function persistToDisk() {
  const dir = path.dirname(storePath);
  fs.mkdirSync(dir, { recursive: true });
  const payload = {
    version: 1,
    updatedAt: new Date().toISOString(),
    items: [...queue.values()],
  };
  const tmp = `${storePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, storePath);
}

/** Test/helper: override store path before first mutation. */
export function setReviewQueueStorePathForTests(nextPath) {
  storePath = nextPath || DEFAULT_STORE_PATH;
  hydrated = false;
  queue = new Map();
}

/**
 * @param {object} candidate
 * @param {{ proposedUse?: string, userId?: string }} [meta]
 */
export function addToReviewQueue(candidate, meta = {}) {
  ensureHydrated();
  if (!candidate?.id) return { ok: false, error: 'candidate_required' };

  const decision = resolveAcquisitionDecision({
    provider: candidate.provider,
    sourceId: `src_${candidate.provider}`,
    license: candidate.license,
    attributionText: candidate.attributionText,
    attributionRequired: candidate.attributionRequired,
  });

  const item = {
    ...candidate,
    reviewId: `rev_${candidate.id}`,
    queueStatus: 'PENDING',
    reviewStatus: decision.reviewStatus || candidate.reviewStatus || 'REVIEW_REQUIRED',
    acquisitionDecision: decision.decision,
    custodyMode: decision.custodyMode,
    rightsConfidence: decision.rightsConfidence,
    proposedUse: meta.proposedUse || 'MARKETING_ASSET',
    addedAt: new Date().toISOString(),
    addedBy: meta.userId || null,
    attributionTextCaptured: candidate.attributionText || null,
  };

  queue.set(item.reviewId, item);
  persistToDisk();
  recordMediaAcquisitionEvent('review_added', {
    reviewId: item.reviewId,
    provider: item.provider,
    decision: item.acquisitionDecision,
  });
  return { ok: true, item };
}

export function listReviewQueue({ status } = {}) {
  ensureHydrated();
  let items = [...queue.values()];
  if (status) items = items.filter((i) => i.queueStatus === status);
  items.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  return items;
}

export function getReviewItem(reviewId) {
  ensureHydrated();
  return queue.get(String(reviewId || '')) || null;
}

/**
 * @param {string} reviewId
 * @param {'approve'|'reference'|'reject'} action
 * @param {{ attributionText?: string, userId?: string }} [opts]
 */
export function resolveReviewItem(reviewId, action, opts = {}) {
  ensureHydrated();
  const item = queue.get(String(reviewId || ''));
  if (!item) return { ok: false, error: 'not_found' };

  if (action === 'reject') {
    item.queueStatus = 'REJECTED';
    item.resolvedAt = new Date().toISOString();
    item.resolvedBy = opts.userId || null;
    persistToDisk();
    recordMediaAcquisitionEvent('review_rejected', { reviewId: item.reviewId });
    return { ok: true, item, next: 'none' };
  }

  if (action === 'reference') {
    item.queueStatus = 'REFERENCE';
    item.acquisitionDecision = 'REFERENCE_ONLY';
    item.custodyMode = 'REFERENCE_ONLY';
    item.resolvedAt = new Date().toISOString();
    item.resolvedBy = opts.userId || null;
    persistToDisk();
    recordMediaAcquisitionEvent('review_reference', { reviewId: item.reviewId });
    return { ok: true, item, next: 'acquire_reference' };
  }

  if (item.acquisitionDecision === 'BLOCKED') {
    return { ok: false, error: 'blocked_cannot_approve', item };
  }

  const attr =
    opts.attributionText ||
    item.attributionTextCaptured ||
    item.attributionText ||
    null;
  if (
    (item.attributionRequired || item.acquisitionDecision === 'DOWNLOAD_WITH_ATTRIBUTION') &&
    !String(attr || '').trim()
  ) {
    return { ok: false, error: 'attribution_required', item };
  }

  item.attributionTextCaptured = attr;
  item.queueStatus = 'APPROVED';
  item.resolvedAt = new Date().toISOString();
  item.resolvedBy = opts.userId || null;
  if (item.acquisitionDecision === 'MANUAL_REVIEW') {
    item.acquisitionDecision = item.attributionRequired
      ? 'DOWNLOAD_WITH_ATTRIBUTION'
      : 'REMOTE_REUSE';
    item.custodyMode = 'PROVIDER_HOSTED';
    item.canAcquire = true;
    item.reviewStatus = item.attributionRequired ? 'ATTRIBUTION_REQUIRED' : 'SAFE_TO_REUSE';
  }

  persistToDisk();
  recordMediaAcquisitionEvent('review_approved', {
    reviewId: item.reviewId,
    decision: item.acquisitionDecision,
  });
  return { ok: true, item, next: 'acquire' };
}

export function resetReviewQueueForTests() {
  queue = new Map();
  hydrated = true;
  try {
    if (fs.existsSync(storePath)) fs.unlinkSync(storePath);
  } catch {
    /* ignore */
  }
}
