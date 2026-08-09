/**
 * Rights Intelligence interface.
 * AI may suggest → Policy decides. Never AI → Publication.
 */

import { RIGHTS_DECISION } from './types.js';

/**
 * Suggest rights from source signals (not authoritative publication).
 */
export function suggestRights(input = {}) {
  const license = String(input.license || '').toLowerCase();
  const status = String(input.rightsStatus || '').toUpperCase();
  const sourceId = String(input.sourceId || '');

  let suggestion = RIGHTS_DECISION.UNKNOWN;
  const notes = [];

  if (sourceId.includes('cardbey_originals') || input.firstParty) {
    suggestion = RIGHTS_DECISION.CLEARED;
    notes.push('first_party_signal');
  } else if (sourceId.includes('pexels') || license.includes('pexels')) {
    suggestion = RIGHTS_DECISION.SUGGESTED;
    notes.push('open_provider_license_signal');
    notes.push('reference_hosting_preferred');
  } else if (status === 'CLEARED') {
    suggestion = RIGHTS_DECISION.SUGGESTED;
    notes.push('upstream_cleared_status');
  } else if (status === 'RESTRICTED' || status === 'REJECTED') {
    suggestion = RIGHTS_DECISION.REJECTED;
    notes.push('upstream_blocked_status');
  } else if (sourceId.includes('creator')) {
    suggestion = RIGHTS_DECISION.NEEDS_REVIEW;
    notes.push('creator_declaration_required');
  }

  return {
    suggestion,
    decision: RIGHTS_DECISION.NEEDS_REVIEW, // Policy gate — never auto-publish
    policyApplied: 'fail_closed_pending_policy_engine',
    notes,
    publicationAllowed: false,
    authority: 'rights_intelligence',
    aiIsNotAuthority: true,
  };
}

/**
 * Policy decision stub — Phase 1 interface only.
 * Future: integrate Policy Engine / Marketplace / Entitlement.
 */
export function decideRights(suggestionResult, policyContext = {}) {
  const suggestion = suggestionResult?.suggestion || RIGHTS_DECISION.UNKNOWN;

  // Explicit admin override only
  if (policyContext.adminForceCleared === true && policyContext.confirm === true) {
    return {
      decision: RIGHTS_DECISION.CLEARED,
      publicationAllowed: false, // still no auto-publish in URI Phase 1
      policyApplied: 'admin_confirmed_clearance',
      fromSuggestion: suggestion,
      authority: 'policy_engine_stub',
    };
  }

  if (suggestion === RIGHTS_DECISION.REJECTED) {
    return {
      decision: RIGHTS_DECISION.REJECTED,
      publicationAllowed: false,
      policyApplied: 'reject_on_suggestion',
      fromSuggestion: suggestion,
      authority: 'policy_engine_stub',
    };
  }

  return {
    decision: RIGHTS_DECISION.NEEDS_REVIEW,
    publicationAllowed: false,
    policyApplied: 'human_or_policy_required',
    fromSuggestion: suggestion,
    authority: 'policy_engine_stub',
    message: 'AI suggestion recorded; Rights/Policy Engine remains authority',
  };
}

export function evaluateResourceRights(record, policyContext = {}) {
  const suggestion = suggestRights({
    sourceId: record.sourceId,
    license: record.sourceMetadata?.license,
    rightsStatus: record.rightsSnapshot?.upstreamStatus,
    firstParty: record.sourceId === 'src_cardbey_originals',
  });
  const decision = decideRights(suggestion, policyContext);
  return { ok: true, suggestion, decision, resourceId: record.id };
}
