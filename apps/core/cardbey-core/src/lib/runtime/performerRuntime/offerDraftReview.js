/**
 * Offer draft review contract (record-only; no publish).
 */
import { listMissionExecutionRecords } from './executionRecords.js';
import { isPerformerExecutionRecordsPersistEnabled } from './runtimeFlags.js';

const OFFER_DRAFT_CAPABILITIES = new Set(['create_offer_draft', 'revise_offer_draft']);

/**
 * @param {object} record
 * @returns {number}
 */
function offerDraftVersionNumber(record) {
  const n = record?.offerDraft?.versionNumber;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/**
 * @param {object[]} records
 * @returns {object|null}
 */
export function pickLatestOfferDraftRecord(records) {
  if (!Array.isArray(records)) return null;
  const sorted = records
    .filter((r) => OFFER_DRAFT_CAPABILITIES.has(r?.capabilityId) && r?.offerDraft)
    .sort((a, b) => {
      const vDiff = offerDraftVersionNumber(b) - offerDraftVersionNumber(a);
      if (vDiff !== 0) return vDiff;
      return (b.updatedAt ?? 0) - (a.updatedAt ?? 0);
    });
  return sorted[0] ?? null;
}

/**
 * @param {object[]} records
 * @returns {string|null}
 */
export function pickLatestOfferDraftStatusFromRecords(records) {
  const latest = pickLatestOfferDraftRecord(records);
  const status = latest?.offerDraft?.status;
  return typeof status === 'string' ? status.trim() : null;
}

/**
 * @param {string|null|undefined} status
 */
export function canPublishOfferDraftStatus(status) {
  return status === 'approved';
}

/**
 * @param {string|null|undefined} status
 */
export function isPublishOfferBlockedByReview(status) {
  return !canPublishOfferDraftStatus(status);
}

/**
 * @param {object} input
 * @param {string} missionId
 */
export async function resolveOfferDraftStatusForDryRun(input, missionId) {
  const ctx = input?.reviewContext;
  if (ctx && typeof ctx.offerDraftStatus === 'string' && ctx.offerDraftStatus.trim()) {
    return ctx.offerDraftStatus.trim();
  }
  const inline = input?.executionRecords;
  if (Array.isArray(inline) && inline.length > 0) {
    return pickLatestOfferDraftStatusFromRecords(inline);
  }
  if (isPerformerExecutionRecordsPersistEnabled() && missionId) {
    try {
      const records = await listMissionExecutionRecords(missionId);
      return pickLatestOfferDraftStatusFromRecords(records);
    } catch {
      return null;
    }
  }
  return null;
}
