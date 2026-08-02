/**
 * Per-draft projection acceptance record (Phase 7).
 * Never makes design library globally authoritative.
 */

export const ACCEPTANCE_VERSION = 1;

export const ACCEPTANCE_STATUSES = Object.freeze(['pending', 'accepted', 'rejected']);

/**
 * @typedef {{
 *   status: 'pending'|'accepted'|'rejected',
 *   confirmationState: 'pending'|'confirmed'|'rejected',
 *   acceptedAt?: string|null,
 *   rejectedAt?: string|null,
 *   decidedBy?: string|null,
 *   blueprintId?: string|null,
 *   primaryAction?: string|null,
 *   projectionFingerprint?: string|null,
 *   comparisonSummary?: Record<string, unknown>|null,
 *   applyToDraftPreview: boolean,
 *   readinessSafeForPreview?: boolean,
 *   note?: string|null,
 *   authoritative: false,
 *   acceptanceVersion: number,
 * }} ProjectionAcceptanceRecord
 */

/**
 * @param {Partial<ProjectionAcceptanceRecord>} [partial]
 * @returns {ProjectionAcceptanceRecord}
 */
export function createPendingAcceptance(partial = {}) {
  return freezeAcceptance({
    status: 'pending',
    confirmationState: 'pending',
    acceptedAt: null,
    rejectedAt: null,
    decidedBy: null,
    blueprintId: partial.blueprintId ?? null,
    primaryAction: partial.primaryAction ?? null,
    projectionFingerprint: partial.projectionFingerprint ?? null,
    comparisonSummary: partial.comparisonSummary ?? null,
    applyToDraftPreview: false,
    readinessSafeForPreview: partial.readinessSafeForPreview ?? null,
    note: null,
    authoritative: false,
    acceptanceVersion: ACCEPTANCE_VERSION,
  });
}

/**
 * @param {ProjectionAcceptanceRecord} record
 */
export function freezeAcceptance(record) {
  return Object.freeze({
    status: record.status,
    confirmationState: record.confirmationState,
    acceptedAt: record.acceptedAt ?? null,
    rejectedAt: record.rejectedAt ?? null,
    decidedBy: record.decidedBy ?? null,
    blueprintId: record.blueprintId ?? null,
    primaryAction: record.primaryAction ?? null,
    projectionFingerprint: record.projectionFingerprint ?? null,
    comparisonSummary: record.comparisonSummary
      ? Object.freeze({ ...record.comparisonSummary })
      : null,
    applyToDraftPreview: Boolean(record.applyToDraftPreview),
    readinessSafeForPreview:
      record.readinessSafeForPreview == null ? null : Boolean(record.readinessSafeForPreview),
    note: record.note ?? null,
    authoritative: false,
    acceptanceVersion: ACCEPTANCE_VERSION,
  });
}

/**
 * Stable fingerprint so acceptance can be invalidated when projection changes.
 * Uses projection fields only (not ephemeral render summaries).
 * @param {object} projection
 * @param {object} [_viewModelSummary] unused — kept for call-site compatibility
 */
export function fingerprintProjection(projection, _viewModelSummary = null) {
  void _viewModelSummary;
  const roles = Array.isArray(projection?.sections)
    ? projection.sections
        .filter((s) => s.visibility === 'visible' || s.visibility === 'footer_only')
        .map((s) => `${s.role}:${s.visibility}:${s.variant}`)
        .sort()
    : [];
  const payload = {
    blueprintId: projection?.blueprintId ?? null,
    businessModel: projection?.businessModel ?? null,
    primaryAction: projection?.primaryAction ?? null,
    secondaryActions: Array.isArray(projection?.secondaryActions)
      ? [...projection.secondaryActions].sort()
      : [],
    roles,
    sectionCount: roles.length,
  };
  return simpleHash(JSON.stringify(payload));
}

/** @param {string} s */
function simpleHash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return `p7:${(h >>> 0).toString(16)}`;
}

/**
 * @param {object} meta
 * @returns {ProjectionAcceptanceRecord | null}
 */
export function readAcceptanceFromMeta(meta) {
  const raw = meta?.designLibraryProjectionAcceptance;
  if (!raw || typeof raw !== 'object') return null;
  return freezeAcceptance({
    status: ACCEPTANCE_STATUSES.includes(raw.status) ? raw.status : 'pending',
    confirmationState: raw.confirmationState ?? 'pending',
    acceptedAt: raw.acceptedAt ?? null,
    rejectedAt: raw.rejectedAt ?? null,
    decidedBy: raw.decidedBy ?? null,
    blueprintId: raw.blueprintId ?? null,
    primaryAction: raw.primaryAction ?? null,
    projectionFingerprint: raw.projectionFingerprint ?? null,
    comparisonSummary: raw.comparisonSummary ?? null,
    applyToDraftPreview: Boolean(raw.applyToDraftPreview),
    readinessSafeForPreview: raw.readinessSafeForPreview,
    note: raw.note ?? null,
    authoritative: false,
    acceptanceVersion: ACCEPTANCE_VERSION,
  });
}
