/**
 * Unified Action Registry — read model over intake, pipeline, and capability catalogs.
 * Does not duplicate authoring; derives Action entries at module load.
 */

import { INTAKE_TOOL_REGISTRY } from '../intake/intakeToolRegistry.js';
import { TOOLS } from '../toolRegistry.js';
import { CAPABILITY_REGISTRY } from '../capabilities/capabilityRegistry.js';
import { actionIdForTool } from './executionTelemetry.js';

/**
 * @typedef {'intake' | 'pipeline' | 'capability_family'} ActionSource
 */

/**
 * @typedef {object} BrokerAction
 * @property {string} id
 * @property {string} capabilityFamily
 * @property {string[]} requiredInputs
 * @property {string[]} expectedOutputs
 * @property {object} executionConstraints
 * @property {object} permissions
 * @property {string[]} fallbackActions
 * @property {string[]} compatibleAgents
 * @property {string[]} telemetryHooks
 * @property {ActionSource} registrySource
 * @property {string|null} toolName
 * @property {string|null} label
 * @property {string|null} executionPath
 * @property {string|null} riskLevel
 */

/** @type {Map<string, BrokerAction>} */
let cache = null;

/**
 * @param {string} toolName
 * @param {object} intakeEntry
 * @returns {BrokerAction}
 */
function actionFromIntake(toolName, intakeEntry) {
  const schema = intakeEntry?.parameterSchema?.properties ?? {};
  const requiredInputs = [
    ...(intakeEntry?.requiredParams ?? []),
    ...Object.keys(schema),
  ].filter((k, i, arr) => arr.indexOf(k) === i);

  return {
    id: actionIdForTool(toolName),
    capabilityFamily: intakeEntry?.executionPath === 'direct_action' ? 'direct_tool' : 'mission_tool',
    requiredInputs,
    expectedOutputs: ['artifact', 'message'],
    executionConstraints: {
      executionPath: intakeEntry?.executionPath ?? 'proactive_plan',
      planRole: intakeEntry?.planRole ?? 'STANDALONE',
      requiresStore: Boolean(intakeEntry?.requiresStore),
    },
    permissions: {
      approvalRequired: Boolean(intakeEntry?.approvalRequired),
      riskLevel: intakeEntry?.riskLevel ?? 'state_change',
    },
    fallbackActions: (intakeEntry?.prerequisiteTools ?? []).map((t) => actionIdForTool(t)),
    compatibleAgents: ['internal_tool'],
    telemetryHooks: ['broker.execution'],
    registrySource: 'intake',
    toolName,
    label: intakeEntry?.label ?? toolName,
    executionPath: intakeEntry?.executionPath ?? null,
    riskLevel: intakeEntry?.riskLevel ?? null,
  };
}

/**
 * @param {object} toolDef
 * @returns {BrokerAction}
 */
function actionFromPipeline(toolDef) {
  const toolName = toolDef.toolName;
  return {
    id: actionIdForTool(toolName),
    capabilityFamily: toolDef.category ?? 'pipeline',
    requiredInputs: [],
    expectedOutputs: ['pipeline_step_output'],
    executionConstraints: {
      targetTypes: toolDef.targetTypes ?? [],
      requiresConfirmation: Boolean(toolDef.requiresConfirmation),
    },
    permissions: {
      approvalRequired: Boolean(toolDef.requiresConfirmation),
      riskLevel: 'state_change',
    },
    fallbackActions: [],
    compatibleAgents: ['internal_tool', 'openclaw', 'langchain'],
    telemetryHooks: ['broker.execution'],
    registrySource: 'pipeline',
    toolName,
    label: toolDef.label ?? toolName,
    executionPath: null,
    riskLevel: null,
  };
}

/**
 * @param {string} capabilityKey
 * @param {object} entry
 * @returns {BrokerAction}
 */
function actionFromCapabilityFamily(capabilityKey, entry) {
  const primary = entry?.primaryTools?.[0] ?? null;
  const fallbacks = (entry?.fallbackTools ?? []).map((t) => actionIdForTool(t));
  return {
    id: `capability:${capabilityKey}`,
    capabilityFamily: capabilityKey,
    requiredInputs: [...(entry?.requiredContext ?? [])],
    expectedOutputs: [...(entry?.artifactTypes ?? [])],
    executionConstraints: {
      providerEnv: entry?.providerEnv ?? [],
    },
    permissions: {
      approvalRequired: false,
      riskLevel: 'state_change',
    },
    fallbackActions: fallbacks,
    compatibleAgents: ['internal_tool'],
    telemetryHooks: ['broker.execution'],
    registrySource: 'capability_family',
    toolName: primary,
    label: entry?.userFacingName ?? capabilityKey,
    executionPath: null,
    riskLevel: null,
  };
}

function buildCache() {
  const map = new Map();

  for (const entry of INTAKE_TOOL_REGISTRY) {
    const name = entry?.toolName;
    if (!name) continue;
    map.set(actionIdForTool(name), actionFromIntake(name, entry));
  }

  for (const toolDef of TOOLS) {
    const id = actionIdForTool(toolDef.toolName);
    if (!map.has(id)) {
      map.set(id, actionFromPipeline(toolDef));
    } else {
      const existing = map.get(id);
      map.set(id, {
        ...existing,
        executionConstraints: {
          ...existing.executionConstraints,
          targetTypes: toolDef.targetTypes ?? [],
          requiresConfirmation: Boolean(toolDef.requiresConfirmation),
        },
        registrySource: 'intake',
      });
    }
  }

  for (const [key, entry] of Object.entries(CAPABILITY_REGISTRY)) {
    if (!entry || key === 'unknown') continue;
    map.set(`capability:${key}`, actionFromCapabilityFamily(key, entry));
  }

  return map;
}

/**
 * @returns {Map<string, BrokerAction>}
 */
export function getActionRegistryMap() {
  if (!cache) cache = buildCache();
  return cache;
}

/**
 * @returns {BrokerAction[]}
 */
export function listBrokerActions() {
  return [...getActionRegistryMap().values()];
}

/**
 * @param {string} actionId
 * @returns {BrokerAction|undefined}
 */
export function getBrokerAction(actionId) {
  const key = typeof actionId === 'string' ? actionId.trim() : '';
  if (!key) return undefined;
  return getActionRegistryMap().get(key);
}

/**
 * @param {string} toolName
 * @returns {BrokerAction|undefined}
 */
export function getBrokerActionForTool(toolName) {
  return getBrokerAction(actionIdForTool(toolName));
}

/**
 * Invalidate cache (tests only).
 */
export function resetActionRegistryCache() {
  cache = null;
}
