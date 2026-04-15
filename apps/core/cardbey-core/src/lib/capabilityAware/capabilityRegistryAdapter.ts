/**
 * Read-time normalization of existing intake registries into CapabilityDefinition[].
 * Does not mutate INTAKE_TOOL_REGISTRY.
 */

import { INTAKE_TOOL_REGISTRY, RISK } from '../intake/intakeToolRegistry.js';
import type { CapabilityDefinition, CapabilityExecutor, CapabilityStatus, CapabilityTier, PerformerRole } from './types.ts';

type RegistryEntry = (typeof INTAKE_TOOL_REGISTRY)[number];

function mapRiskToLevel(risk: string | undefined): 'low' | 'medium' | 'high' {
  if (risk === RISK.DESTRUCTIVE) return 'high';
  if (risk === RISK.STATE_CHANGE) return 'medium';
  return 'low';
}

function inferTier(entry: RegistryEntry): CapabilityTier {
  if (entry.riskLevel === RISK.DESTRUCTIVE && entry.approvalRequired) return 'premium';
  if (entry.approvalRequired && entry.riskLevel === RISK.STATE_CHANGE) return 'premium';
  return 'standard';
}

function inferExecutor(_entry: RegistryEntry): CapabilityExecutor {
  return 'internal_tool';
}

function inferStatus(_entry: RegistryEntry): CapabilityStatus {
  return 'ready';
}

function schemaKeys(entry: RegistryEntry): { inputs: string[]; outputs: string[] } {
  const props = entry.parameterSchema?.properties;
  if (!props || typeof props !== 'object') return { inputs: [], outputs: [] };
  const keys = Object.keys(props);
  return { inputs: keys, outputs: ['tool_result'] };
}

function defaultRoles(entry: RegistryEntry): string[] {
  const roles: PerformerRole[] = ['generic_operator'];
  if (entry.requiresStore) roles.push('store_operator');
  if (entry.toolName.includes('campaign') || entry.toolName.includes('promotion')) {
    roles.push('campaign_manager');
  }
  if (entry.toolName === 'market_research' || entry.toolName === 'analyze_store') {
    roles.push('research_agent');
  }
  if (entry.toolName === 'create_store' || entry.toolName === 'generate_mini_website') {
    roles.push('business_launcher');
  }
  return [...new Set(roles)];
}

function toolToCapability(entry: RegistryEntry): CapabilityDefinition {
  const { inputs, outputs } = schemaKeys(entry);
  const supportsGuest = !entry.requiresStore;
  return {
    id: entry.toolName,
    name: entry.label,
    description: entry.semanticDescription ?? entry.label,
    category: `${entry.executionPath}:${entry.planRole}`,
    tier: inferTier(entry),
    executor: inferExecutor(entry),
    status: inferStatus(entry),
    supportedRoles: defaultRoles(entry),
    inputs,
    outputs,
    requiresAuth: true,
    requiresApproval: Boolean(entry.approvalRequired),
    supportsGuest,
    qualityLevel: inferTier(entry) === 'premium' ? 'high' : 'medium',
    riskLevel: mapRiskToLevel(entry.riskLevel),
    fallbackCapabilityIds: [],
    substituteFor: [],
  };
}

let cached: CapabilityDefinition[] | null = null;

export function getCapabilityRegistry(): CapabilityDefinition[] {
  if (!cached) {
    cached = INTAKE_TOOL_REGISTRY.map(toolToCapability);
  }
  return cached;
}

export function getCapabilityById(id: string): CapabilityDefinition | undefined {
  const tid = String(id ?? '').trim();
  if (!tid) return undefined;
  return getCapabilityRegistry().find((c) => c.id === tid);
}

export function getCapabilitiesForRole(role: PerformerRole): CapabilityDefinition[] {
  const r = String(role ?? '').trim();
  if (!r) return getCapabilityRegistry();
  return getCapabilityRegistry().filter((c) => c.supportedRoles.includes(r));
}

/** Test hook — avoid cross-test cache bleed. */
export function resetCapabilityRegistryCacheForTests(): void {
  cached = null;
}
