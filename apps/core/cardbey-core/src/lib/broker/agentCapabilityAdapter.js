/**
 * Agent Capability Protocol (ACP) — normalize pluggable agents/tools for broker routing.
 */

import { AGENT_REGISTRY } from '../agents/agentRegistry.js';
import { listMcpAdapterIds } from '../mcp/adapterRegistry.js';
import { getExecutor } from '../toolExecutors/index.js';
import { getBrokerActionForTool, listBrokerActions } from './actionRegistry.js';
import { actionIdForTool } from './executionTelemetry.js';

/**
 * @typedef {object} AgentCapability
 * @property {string} capabilityId
 * @property {string[]} supportedActions
 * @property {object} inputSchema
 * @property {object} outputSchema
 * @property {object} executionPolicy
 * @property {object} runtimeRequirements
 * @property {object} permissions
 * @property {boolean} telemetrySupport
 * @property {object|null} costProfile
 * @property {object|null} reliabilityMetrics
 * @property {string} adapterKind
 */

/** @type {AgentCapability[]|null} */
let cache = null;

/**
 * @param {string} toolName
 * @returns {AgentCapability}
 */
function acpFromInternalTool(toolName) {
  const action = getBrokerActionForTool(toolName);
  const hasExecutor = Boolean(getExecutor(toolName));
  return {
    capabilityId: `agent:tool:${toolName}`,
    supportedActions: [actionIdForTool(toolName)],
    inputSchema: { type: 'object', properties: action?.requiredInputs ?? [] },
    outputSchema: { type: 'object', artifacts: action?.expectedOutputs ?? [] },
    executionPolicy: {
      mode: 'sync',
      requiresMission: false,
    },
    runtimeRequirements: {
      executorRegistered: hasExecutor,
    },
    permissions: action?.permissions ?? {},
    telemetrySupport: true,
    costProfile: null,
    reliabilityMetrics: null,
    adapterKind: 'internal_tool',
  };
}

/**
 * @param {string} agentId
 * @param {object} def
 * @returns {AgentCapability}
 */
function acpFromLlmAgent(agentId, def) {
  return {
    capabilityId: `agent:llm:${agentId}`,
    supportedActions: [],
    inputSchema: { type: 'object' },
    outputSchema: { contract: def?.outputContract ?? 'unknown' },
    executionPolicy: {
      mode: 'sync',
      model: def?.model ?? null,
      maxTokens: def?.maxTokens ?? null,
    },
    runtimeRequirements: {
      provider: 'llm_gateway',
    },
    permissions: { requiresAuth: true },
    telemetrySupport: true,
    costProfile: { model: def?.model },
    reliabilityMetrics: null,
    adapterKind: 'internal_agent',
  };
}

/**
 * @param {string} adapterId
 * @returns {AgentCapability}
 */
function acpFromMcp(adapterId) {
  return {
    capabilityId: `agent:mcp:${adapterId}`,
    supportedActions: [],
    inputSchema: { type: 'object' },
    outputSchema: { type: 'object' },
    executionPolicy: { mode: 'sync', envelope: 'McpInvocationEnvelope' },
    runtimeRequirements: { mcp: true },
    permissions: { serverSideOnly: true },
    telemetrySupport: true,
    costProfile: null,
    reliabilityMetrics: null,
    adapterKind: 'mcp_adapter',
  };
}

function buildCache() {
  const caps = [];
  const toolActions = listBrokerActions().filter((a) => a.toolName && a.registrySource !== 'capability_family');
  const seenTools = new Set();
  for (const action of toolActions) {
    const name = action.toolName;
    if (!name || seenTools.has(name)) continue;
    seenTools.add(name);
    caps.push(acpFromInternalTool(name));
  }

  for (const [agentId, def] of Object.entries(AGENT_REGISTRY)) {
    caps.push(acpFromLlmAgent(agentId, def));
  }

  for (const adapterId of listMcpAdapterIds()) {
    caps.push(acpFromMcp(adapterId));
  }

  return caps;
}

/**
 * @returns {AgentCapability[]}
 */
export function listAgentCapabilities() {
  if (!cache) cache = buildCache();
  return cache;
}

/**
 * @param {string} capabilityId
 * @returns {AgentCapability|undefined}
 */
export function getAgentCapability(capabilityId) {
  const id = typeof capabilityId === 'string' ? capabilityId.trim() : '';
  if (!id) return undefined;
  return listAgentCapabilities().find((c) => c.capabilityId === id);
}

/**
 * Find ACP entries that support a given action id.
 *
 * @param {string} actionId
 * @returns {AgentCapability[]}
 */
export function findAgentCapabilitiesForAction(actionId) {
  const key = typeof actionId === 'string' ? actionId.trim() : '';
  if (!key) return [];
  return listAgentCapabilities().filter((c) => c.supportedActions.includes(key));
}

export function resetAgentCapabilityCache() {
  cache = null;
}
