/**
 * Revalidate source availability + rights before reuse execution.
 */

import { getResourceRecord } from './resourceIndex.js';
import { getSourceNode } from './sourceFederation.js';
import { evaluateResourceRights } from './rightsIntelligence.js';
import { RIGHTS_DECISION, POLICY_VERSION } from './types.js';

/**
 * @param {object} resource — indexed record or snapshot payload
 * @param {object} [opts]
 * @param {object} [opts.overrides] — ops simulation hooks
 */
export function revalidateSourceAndRights(resource, opts = {}) {
  const overrides = opts.overrides || {};
  const sourceId = resource.sourceId;
  const source = getSourceNode(sourceId);

  if (overrides.sourceRemoved === true || !source || source.status !== 'ACTIVE') {
    return {
      ok: false,
      blocked: true,
      code: 'SOURCE_REMOVED_OR_INACTIVE',
      message: 'Source item removed or federation node inactive after indexing',
      policyVersion: POLICY_VERSION,
    };
  }

  if (overrides.licenceChanged === true) {
    resource = {
      ...resource,
      sourceMetadata: {
        ...(resource.sourceMetadata || {}),
        license: overrides.newLicence || 'RESTRICTED',
      },
      rightsSnapshot: {
        ...(resource.rightsSnapshot || {}),
        upstreamStatus: 'RESTRICTED',
      },
    };
  }

  const rights = evaluateResourceRights(resource, opts.policyContext || {});
  let decision = rights.decision;

  if (overrides.forceBlocked === true) {
    decision = {
      ...decision,
      decision: RIGHTS_DECISION.REJECTED,
      publicationAllowed: false,
      policyApplied: 'ops_simulated_block',
    };
  }

  if (decision.decision === RIGHTS_DECISION.REJECTED) {
    return {
      ok: false,
      blocked: true,
      code: 'RIGHTS_BLOCKED',
      message: 'Rights decision blocked reuse',
      rights: { ...rights, decision },
      policyVersion: POLICY_VERSION,
    };
  }

  // Live index check — resource may have been dropped from memory index
  const live = getResourceRecord(resource.id);
  if (!live && overrides.allowMissingIndex !== true) {
    // Snapshot payload is still usable for REFERENCE/PROVIDER_HOSTED
    if (!resource.previewUrl && !resource.canonicalUrl && !resource.provenance?.assetId) {
      return {
        ok: false,
        blocked: true,
        code: 'RESOURCE_UNAVAILABLE',
        message: 'Resource no longer available for reuse',
        policyVersion: POLICY_VERSION,
      };
    }
  }

  return {
    ok: true,
    blocked: false,
    resource: live || resource,
    rights: { ...rights, decision },
    policyVersion: POLICY_VERSION,
    revalidatedAt: new Date().toISOString(),
  };
}
