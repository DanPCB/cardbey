/**
 * Minimal review queue for media acquisition (in-process).
 */

import { resolveAcquisitionDecision } from './acquisitionDecision.js';
import { recordMediaAcquisitionEvent } from './observability.js';

/** @type {Map<string, object>} */
const queue = new Map();

/**
 * @param {object} candidate
 * @param {{ proposedUse?: string, userId?: string }} [meta]
 */
export function addToReviewQueue(candidate, meta = {}) {
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
  recordMediaAcquisitionEvent('review_added', {
    reviewId: item.reviewId,
    provider: item.provider,
    decision: item.acquisitionDecision,
  });
  return { ok: true, item };
}

export function listReviewQueue({ status } = {}) {
  let items = [...queue.values()];
  if (status) items = items.filter((i) => i.queueStatus === status);
  items.sort((a, b) => String(b.addedAt).localeCompare(String(a.addedAt)));
  return items;
}

export function getReviewItem(reviewId) {
  return queue.get(String(reviewId || '')) || null;
}

/**
 * @param {string} reviewId
 * @param {'approve'|'reference'|'reject'} action
 * @param {{ attributionText?: string, userId?: string }} [opts]
 */
export function resolveReviewItem(reviewId, action, opts = {}) {
  const item = queue.get(String(reviewId || ''));
  if (!item) return { ok: false, error: 'not_found' };

  if (action === 'reject') {
    item.queueStatus = 'REJECTED';
    item.resolvedAt = new Date().toISOString();
    item.resolvedBy = opts.userId || null;
    recordMediaAcquisitionEvent('review_rejected', { reviewId: item.reviewId });
    return { ok: true, item, next: 'none' };
  }

  if (action === 'reference') {
    item.queueStatus = 'REFERENCE';
    item.acquisitionDecision = 'REFERENCE_ONLY';
    item.custodyMode = 'REFERENCE_ONLY';
    item.resolvedAt = new Date().toISOString();
    item.resolvedBy = opts.userId || null;
    recordMediaAcquisitionEvent('review_reference', { reviewId: item.reviewId });
    return { ok: true, item, next: 'acquire_reference' };
  }

  // approve
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
  // Approving review-required raises confidence for acquire path
  if (item.acquisitionDecision === 'MANUAL_REVIEW') {
    item.acquisitionDecision = item.attributionRequired
      ? 'DOWNLOAD_WITH_ATTRIBUTION'
      : 'REMOTE_REUSE';
    item.custodyMode = 'PROVIDER_HOSTED';
    item.canAcquire = true;
    item.reviewStatus = item.attributionRequired ? 'ATTRIBUTION_REQUIRED' : 'SAFE_TO_REUSE';
  }

  recordMediaAcquisitionEvent('review_approved', {
    reviewId: item.reviewId,
    decision: item.acquisitionDecision,
  });
  return { ok: true, item, next: 'acquire' };
}

export function resetReviewQueueForTests() {
  queue.clear();
}
