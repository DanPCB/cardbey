/**
 * Reuse Planner — creates a confirmable plan; never auto-downloads/hosts/publishes.
 * Phase 2: custody modes REFERENCE_ONLY | PROVIDER_HOSTED | PULL_ON_USE.
 */

import { getResourceRecord } from './resourceIndex.js';
import { evaluateResourceRights } from './rightsIntelligence.js';
import {
  REUSE_MODE,
  CUSTODY_MODE,
  CUSTODY_MODE_PHASE2_ENABLED,
  CUSTODY_MODE_DISABLED,
  POLICY_VERSION,
} from './types.js';

/**
 * @param {object} input
 */
export async function buildReusePlan(input = {}) {
  const resourceIds = Array.isArray(input.resourceIds) ? input.resourceIds : [];
  if (!resourceIds.length) {
    return { ok: false, error: 'resourceIds_required' };
  }

  const requestedCustody = input.custodyMode || null;
  if (requestedCustody && CUSTODY_MODE_DISABLED.includes(requestedCustody)) {
    return {
      ok: false,
      error: 'custody_mode_disabled',
      mode: requestedCustody,
      enabled: CUSTODY_MODE_PHASE2_ENABLED,
    };
  }

  const items = [];
  for (const id of resourceIds) {
    const record = getResourceRecord(id);
    if (!record) {
      items.push({ resourceId: id, error: 'not_indexed' });
      continue;
    }
    const rights = evaluateResourceRights(record, input.policyContext || {});
    const modes = recommendModes(record, rights);
    const custody = recommendCustody(record, requestedCustody);
    items.push({
      resourceId: id,
      title: record.title,
      sourceId: record.sourceId,
      rights,
      recommendedMode: modes[0],
      availableModes: modes,
      custodyMode: custody,
      availableCustodyModes: [...CUSTODY_MODE_PHASE2_ENABLED],
      disabledCustodyModes: [...CUSTODY_MODE_DISABLED],
      requiresUserConfirmation: true,
      autoExecute: false,
      autoPublish: false,
    });
  }

  return {
    ok: true,
    reusePlan: {
      id: `reuse_${Date.now().toString(36)}`,
      createdAt: new Date().toISOString(),
      status: 'AWAITING_CONFIRMATION',
      policyVersion: POLICY_VERSION,
      items,
      policies: {
        download: false,
        host: false,
        publish: false,
        transform: false,
        permanentHosting: false,
        marketplaceResale: false,
        autonomousPublication: false,
        note: 'User must confirm; Phase 2 executes REFERENCE/PROVIDER_HOSTED/PULL_ON_USE into drafts only',
      },
    },
  };
}

function recommendCustody(record, requested) {
  if (requested && CUSTODY_MODE_PHASE2_ENABLED.includes(requested)) return requested;
  if (record.sourceId === 'src_pexels' || record.technical?.hostingMode === 'REFERENCE') {
    return CUSTODY_MODE.PROVIDER_HOSTED;
  }
  if (record.sourceId?.startsWith('src_cardbey')) return CUSTODY_MODE.REFERENCE_ONLY;
  return CUSTODY_MODE.PULL_ON_USE;
}

function recommendModes(record, rights) {
  const modes = [];
  if (record.technical?.hostingMode === 'REFERENCE' || record.sourceId === 'src_pexels') {
    modes.push(REUSE_MODE.REFERENCE);
    modes.push(REUSE_MODE.PULL);
  }
  if (record.sourceId?.startsWith('src_cardbey')) {
    modes.push(REUSE_MODE.REFERENCE);
    modes.push(REUSE_MODE.CACHE);
  }
  if (rights.decision.decision === 'REJECTED') {
    return [REUSE_MODE.REQUEST_PERMISSION];
  }
  if (rights.decision.decision === 'NEEDS_REVIEW') {
    modes.push(REUSE_MODE.REQUEST_PERMISSION);
  }
  modes.push(REUSE_MODE.GENERATE_ALTERNATIVE);
  if (!modes.includes(REUSE_MODE.REFERENCE)) modes.unshift(REUSE_MODE.REFERENCE);
  return [...new Set(modes)];
}

/**
 * Confirm reuse plan — records confirmation only unless Phase 2 executor is invoked separately.
 */
export function confirmReusePlan(reusePlan, { confirm = false } = {}) {
  if (!reusePlan?.id) return { ok: false, error: 'reuse_plan_required' };
  if (!confirm) return { ok: false, error: 'confirmation_required' };
  return {
    ok: true,
    reusePlan: {
      ...reusePlan,
      status: 'CONFIRMED_PENDING_EXECUTION',
      confirmedAt: new Date().toISOString(),
      execution: {
        phase: '2_reuse_pilot',
        note: 'Call POST /reuse/confirm with reuseDecisionId to execute custody-aware draft use',
      },
    },
  };
}
