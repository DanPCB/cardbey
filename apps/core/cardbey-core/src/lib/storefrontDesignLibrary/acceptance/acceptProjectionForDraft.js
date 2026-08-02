/**
 * Explicit accept / reject of projected structure for a single draft.
 */

import {
  isDesignLibraryV1Enabled,
  isDesignLibraryAuthoritative,
  isStorefrontProjectionAcceptanceEnabled,
} from '../flags.js';
import { buildOwnerProjectionComparison } from './buildOwnerComparison.js';
import { validateAcceptanceRequest } from './acceptanceValidator.js';
import { freezeAcceptance, ACCEPTANCE_VERSION } from './acceptanceRecord.js';

/**
 * @param {object} catalog
 * @param {{
 *   decision: 'accept'|'reject',
 *   confirm: boolean,
 *   applyToDraftPreview?: boolean,
 *   note?: string,
 *   actorUserId?: string|null,
 * }} decision
 * @param {Record<string, unknown>} [context]
 * @param {{ force?: boolean }} [opts]
 */
export function decideProjectionAcceptance(catalog, decision, context = {}, opts = {}) {
  if (!catalog || typeof catalog !== 'object') {
    return { catalog, acceptance: null, ok: false, errors: ['catalog_missing'] };
  }
  if (!opts.force && (!isDesignLibraryV1Enabled() || !isStorefrontProjectionAcceptanceEnabled())) {
    return { catalog, acceptance: null, ok: false, errors: ['acceptance_disabled'] };
  }
  void isDesignLibraryAuthoritative(); // remains false globally

  const comparison = buildOwnerProjectionComparison(catalog, context);
  const validation = validateAcceptanceRequest(decision, {
    projectionPresent: Boolean(catalog.meta?.designLibraryStorefrontProjection),
    safeForPreview: comparison.recommended.readiness?.safeForPreview,
    fingerprint: comparison.projectionFingerprint,
  });
  if (!validation.ok) {
    return { catalog, acceptance: null, ok: false, errors: validation.errors, comparison };
  }

  const now = new Date().toISOString();
  const decisionKey = String(decision.decision).toLowerCase();
  const applyToDraftPreview =
    decisionKey === 'accept' ? decision.applyToDraftPreview !== false : false;

  const acceptance = freezeAcceptance({
    status: decisionKey === 'accept' ? 'accepted' : 'rejected',
    confirmationState: decisionKey === 'accept' ? 'confirmed' : 'rejected',
    acceptedAt: decisionKey === 'accept' ? now : null,
    rejectedAt: decisionKey === 'reject' ? now : null,
    decidedBy: decision.actorUserId ?? null,
    blueprintId: comparison.recommended.blueprintId,
    primaryAction: comparison.recommended.primaryAction,
    projectionFingerprint: comparison.projectionFingerprint,
    comparisonSummary: comparison.recommended.comparisonSummary,
    applyToDraftPreview,
    readinessSafeForPreview: comparison.recommended.readiness?.safeForPreview ?? null,
    note: decision.note != null ? String(decision.note).slice(0, 500) : null,
    authoritative: false,
    acceptanceVersion: ACCEPTANCE_VERSION,
  });

  const next = {
    ...catalog,
    meta: {
      ...(catalog.meta && typeof catalog.meta === 'object' ? catalog.meta : {}),
      designLibraryProjectionAcceptance: acceptance,
    },
  };

  emitAcceptanceDecided({
    decision: acceptance.status,
    draftStoreId: context.draftStoreId ?? null,
    missionId: context.missionId ?? null,
    acceptance,
  });

  return {
    catalog: next,
    acceptance,
    ok: true,
    errors: [],
    comparison,
  };
}

/**
 * Convenience wrappers
 */
export function acceptProjectionForDraft(catalog, opts = {}, context = {}) {
  return decideProjectionAcceptance(
    catalog,
    {
      decision: 'accept',
      confirm: opts.confirm === true,
      applyToDraftPreview: opts.applyToDraftPreview !== false,
      note: opts.note,
      actorUserId: opts.actorUserId,
    },
    context,
    { force: opts.force },
  );
}

export function rejectProjectionForDraft(catalog, opts = {}, context = {}) {
  return decideProjectionAcceptance(
    catalog,
    {
      decision: 'reject',
      confirm: opts.confirm === true,
      applyToDraftPreview: false,
      note: opts.note,
      actorUserId: opts.actorUserId,
    },
    context,
    { force: opts.force },
  );
}

function emitAcceptanceDecided(payload) {
  const event = {
    event: 'storefront.projection_acceptance.decided',
    missionId: payload.missionId ?? null,
    draftStoreId: payload.draftStoreId ?? null,
    decision: payload.decision,
    blueprintId: payload.acceptance.blueprintId,
    applyToDraftPreview: payload.acceptance.applyToDraftPreview,
    projectionFingerprint: payload.acceptance.projectionFingerprint,
    acceptanceVersion: ACCEPTANCE_VERSION,
    authoritative: false,
  };
  if (process.env.NODE_ENV !== 'production' || process.env.DESIGN_LIBRARY_POLICY_LOG === '1') {
    try {
      console.info('[storefrontDesignLibrary]', JSON.stringify(event));
    } catch {
      /* ignore */
    }
  }
  return event;
}
