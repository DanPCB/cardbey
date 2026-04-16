/**
 * Read-time normalization of existing intake registries into CapabilityDefinition[].
 * Does not mutate INTAKE_TOOL_REGISTRY.
 */

import { INTAKE_TOOL_REGISTRY, RISK } from '../intake/intakeToolRegistry.js';
import type {
  CapabilityDefinition,
  CapabilityExecutor,
  CapabilityIntent,
  CapabilityIntentMapping,
  CapabilityStatus,
  CapabilityTier,
  PerformerRole,
  SmartDocumentCapabilityDefinition,
} from './types.ts';

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
  if (entry.toolName === 'analyze_content') {
    roles.push('concierge_operator');
  }
  return [...new Set(roles)];
}

function defaultIntents(entry: RegistryEntry): CapabilityIntent[] {
  if (entry.toolName === 'create_store') return ['create_store'];
  if (entry.toolName === 'generate_mini_website') return ['generate_mini_website'];
  if (entry.toolName === 'analyze_content') return ['analyze_content'];
  return [entry.toolName];
}

function smartDocumentShape(entry: RegistryEntry): SmartDocumentCapabilityDefinition | undefined {
  if (entry.toolName !== 'analyze_content') return undefined;
  return {
    documentType: 'other',
    supportsConcierge: true,
    conciergeMode: 'embedded',
    supportsQrCode: false,
    supportsPublicView: false,
    supportsShareLink: false,
  };
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
    intents: defaultIntents(entry),
    smartDocument: smartDocumentShape(entry),
  };
}

const INTENT_ALIAS_MAPPINGS: CapabilityIntentMapping[] = [
  {
    intentType: 'create_card',
    capabilityId: 'create_card',
    aliasOfCapabilityId: 'analyze_content',
    source: 'intent_alias',
  },
  {
    intentType: 'create_smart_document',
    capabilityId: 'create_smart_document',
    aliasOfCapabilityId: 'analyze_content',
    source: 'intent_alias',
  },
];

let cached: CapabilityDefinition[] | null = null;

export function getCapabilityRegistry(): CapabilityDefinition[] {
  if (!cached) {
    const base = INTAKE_TOOL_REGISTRY.map(toolToCapability);
    const aliases = INTENT_ALIAS_MAPPINGS.map((mapping) => {
      const sourceCapability = base.find((cap) => cap.id === mapping.aliasOfCapabilityId);
      const documentType = mapping.intentType === 'create_card' ? 'card' : 'other';
      return {
        ...(sourceCapability ?? {
          id: mapping.capabilityId,
          name: mapping.intentType,
          description: mapping.intentType,
          category: 'direct_action:standalone',
          tier: 'standard',
          executor: 'internal_tool',
          status: 'ready',
          supportedRoles: ['generic_operator'],
          inputs: [],
          outputs: ['tool_result'],
          requiresAuth: true,
          requiresApproval: false,
          supportsGuest: true,
        }),
        id: mapping.capabilityId,
        name: mapping.intentType === 'create_card' ? 'Create Card' : 'Create Smart Document',
        description:
          mapping.intentType === 'create_card'
            ? 'Create a smart card artifact with concierge and public/share support.'
            : 'Create a smart document artifact with concierge and public/share support.',
        supportedRoles: Array.from(
          new Set([...(sourceCapability?.supportedRoles ?? ['generic_operator']), 'business_launcher', 'concierge_operator']),
        ),
        intents: [mapping.intentType],
        smartDocument: {
          documentType,
          supportsConcierge: true,
          conciergeMode: 'embedded',
          supportsQrCode: true,
          supportsPublicView: true,
          supportsShareLink: true,
        },
      } satisfies CapabilityDefinition;
    });
    cached = [...base, ...aliases];
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

export function getCapabilityIntentMappings(): CapabilityIntentMapping[] {
  const registryMappings: CapabilityIntentMapping[] = getCapabilityRegistry().flatMap((cap) =>
    (cap.intents ?? []).map((intentType) => ({
      intentType,
      capabilityId: cap.id,
      source: 'registry' as const,
    })),
  );
  return [...registryMappings, ...INTENT_ALIAS_MAPPINGS];
}

/** Test hook — avoid cross-test cache bleed. */
export function resetCapabilityRegistryCacheForTests(): void {
  cached = null;
}
