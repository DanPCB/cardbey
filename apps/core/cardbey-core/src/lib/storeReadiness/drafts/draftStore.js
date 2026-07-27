/**
 * In-memory ReadinessDraft store (Phase 3).
 * Not a parallel publish stack — proposals only until owner approves apply via existing APIs.
 */

import crypto from 'crypto';

/** @type {Map<string, import('./draftTypes.js').ReadinessDraft>} */
const draftsById = new Map();

/** @type {Array<import('./draftTypes.js').ReadinessDraftApprovalRecord>} */
const approvalAudit = [];

export const DRAFT_TYPES = [
  'business_description',
  'hero_headline',
  'hero_subheading',
  'cta_text',
  'product_description',
  'service_description',
  'faq',
  'campaign_copy',
  'loyalty_introduction',
];

/**
 * @returns {string}
 */
export function newDraftId() {
  return `rd_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * @param {import('./draftTypes.js').ReadinessDraft} draft
 */
export function saveReadinessDraft(draft) {
  draftsById.set(draft.id, { ...draft });
  return draftsById.get(draft.id);
}

/**
 * @param {string} id
 */
export function getReadinessDraft(id) {
  return draftsById.get(String(id)) || null;
}

/**
 * @param {string} storeId
 * @param {string} [ownerUserId]
 */
export function listReadinessDraftsForStore(storeId, ownerUserId) {
  return [...draftsById.values()].filter(
    (d) =>
      d.storeId === storeId &&
      (!ownerUserId || d.ownerUserId === ownerUserId) &&
      d.status !== 'discarded',
  );
}

/**
 * @param {import('./draftTypes.js').ReadinessDraftApprovalRecord} record
 */
export function appendDraftApprovalRecord(record) {
  approvalAudit.push({ ...record });
  if (approvalAudit.length > 500) approvalAudit.shift();
  return record;
}

export function listDraftApprovalRecords(storeId) {
  return approvalAudit.filter((r) => r.storeId === storeId);
}

/** Test helper */
export function resetReadinessDraftStoreForTests() {
  draftsById.clear();
  approvalAudit.length = 0;
}
