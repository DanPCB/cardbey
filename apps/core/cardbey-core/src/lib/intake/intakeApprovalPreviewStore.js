/**
 * In-memory TTL store for Intake V2 approval previews (confirm must re-validate before execute).
 */

const TTL_MS = 7 * 60 * 1000; // 7 minutes

/** @type {Map<string, object>} */
const previewStore = new Map();

function pruneExpired() {
  const now = Date.now();
  for (const [id, row] of previewStore.entries()) {
    if (row.expiresAt <= now) previewStore.delete(id);
  }
}

/**
 * @param {object} row
 * @param {string} row.previewId
 * @param {string} row.tool
 * @param {Record<string, unknown>} row.executionParameters
 * @param {string} row.actorKey
 * @param {string} row.tenantKey
 * @param {string | null} row.resolvedStoreIdAtPreview
 */
export function putIntakeApprovalPreview(row) {
  pruneExpired();
  const expiresAt = Date.now() + TTL_MS;
  previewStore.set(row.previewId, {
    ...row,
    createdAt: Date.now(),
    expiresAt,
  });
}

/** @returns {object | null} */
export function getIntakeApprovalPreview(previewId) {
  pruneExpired();
  const id = String(previewId ?? '').trim();
  if (!id) return null;
  const row = previewStore.get(id);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    previewStore.delete(id);
    return null;
  }
  return row;
}

export function deleteIntakeApprovalPreview(previewId) {
  previewStore.delete(String(previewId ?? '').trim());
}

/** Test helper */
export function clearIntakeApprovalPreviewStoreForTests() {
  previewStore.clear();
}

export function intakeApprovalPreviewStoreSizeForTests() {
  pruneExpired();
  return previewStore.size;
}
