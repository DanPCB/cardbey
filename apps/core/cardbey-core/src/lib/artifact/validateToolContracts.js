/**
 * Validates tool contract references on an ArtifactBundle.
 */

import { getToolEntry, isRegisteredTool } from '../intake/intakeToolRegistry.js';

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * @param {import('./types.ts').ToolContractRef[] | undefined | null} toolContracts
 * @param {import('./types.ts').TopologyArtifact | undefined | null} topology
 * @returns {{ ok: boolean, errors?: string[], warnings?: string[] }}
 */
export function validateToolContracts(toolContracts, topology) {
  const errors = [];
  const warnings = [];

  if (!toolContracts || toolContracts.length === 0) {
    return { ok: true, warnings: ['no toolContracts provided'] };
  }

  const nodeIds = new Set(
    Array.isArray(topology?.nodes)
      ? topology.nodes
          .map((n) => (isObject(n) && typeof n.id === 'string' ? n.id.trim() : ''))
          .filter(Boolean)
      : [],
  );

  for (let i = 0; i < toolContracts.length; i++) {
    const contract = toolContracts[i];
    if (!isObject(contract)) {
      errors.push(`toolContracts[${i}] must be an object`);
      continue;
    }

    const toolName = typeof contract.toolName === 'string' ? contract.toolName.trim() : '';
    const nodeId = typeof contract.nodeId === 'string' ? contract.nodeId.trim() : '';

    if (!toolName) {
      errors.push(`toolContracts[${i}].toolName is required`);
    } else if (!isRegisteredTool(toolName)) {
      errors.push(`toolContracts[${i}].toolName "${toolName}" is not registered`);
    }

    if (!nodeId) {
      errors.push(`toolContracts[${i}].nodeId is required`);
    } else if (nodeIds.size > 0 && !nodeIds.has(nodeId)) {
      errors.push(`toolContracts[${i}].nodeId "${nodeId}" not found in topology`);
    }

    if (toolName && isRegisteredTool(toolName)) {
      const entry = getToolEntry(toolName);
      if (entry?.requiredParams?.length && Array.isArray(contract.requiredParams)) {
        for (const param of contract.requiredParams) {
          if (!entry.requiredParams.includes(param)) {
            warnings.push(`toolContracts[${i}] lists unknown required param "${param}" for ${toolName}`);
          }
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    errors: errors.length ? errors : undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}

import { validateTopologyArtifact } from './validateTopologyArtifact.js';
import { validatePolicyArtifact } from './validatePolicyArtifact.js';

/**
 * @param {import('./types.ts').ArtifactBundle} bundle
 * @returns {{ ok: boolean, errors?: string[], warnings?: string[] }}
 */
export function validateArtifactBundle(bundle) {

  const errors = [];
  const warnings = [];

  const topologyResult = validateTopologyArtifact(bundle?.topology);
  const policyResult = validatePolicyArtifact(bundle?.policy);
  const contractsResult = validateToolContracts(bundle?.toolContracts, bundle?.topology);

  if (!topologyResult.ok) errors.push(...(topologyResult.errors ?? []));
  if (!policyResult.ok) errors.push(...(policyResult.errors ?? []));
  if (!contractsResult.ok) errors.push(...(contractsResult.errors ?? []));

  if (topologyResult.warnings?.length) warnings.push(...topologyResult.warnings);
  if (contractsResult.warnings?.length) warnings.push(...contractsResult.warnings);

  if (!bundle?.reasoning || typeof bundle.reasoning.summary !== 'string') {
    errors.push('artifactBundle.reasoning.summary is required');
  }

  return {
    ok: errors.length === 0,
    errors: errors.length ? errors : undefined,
    warnings: warnings.length ? warnings : undefined,
  };
}
