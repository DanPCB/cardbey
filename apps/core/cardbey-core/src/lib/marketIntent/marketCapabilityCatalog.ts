/**
 * G3 capability authority — normalizes intakeToolRegistry for market-intent matching.
 * Does NOT duplicate INTAKE_TOOL_REGISTRY; applies market-context availability overlay.
 */
import { INTAKE_TOOL_REGISTRY, getToolEntry, RISK } from '../intake/intakeToolRegistry.js';

export type { CapabilityAvailability } from './opportunityTypes.js';
import type { CapabilityAvailability } from './opportunityTypes.js';

export interface MarketCapabilityDefinition {
  capabilityId: string;
  capabilityName: string;
  semanticDescription: string;
  availability: CapabilityAvailability;
  requiresStore: boolean;
  approvalRequired: boolean;
  riskLevel: string;
  executionPath: string;
  prerequisiteTools: string[];
  limitations: string[];
  /** Keywords for semantic need matching */
  needTags: string[];
}

/** Runtime/market-context overlays — conservative for prospect matching */
const AVAILABILITY_OVERRIDES: Record<string, CapabilityAvailability> = {
  market_research: 'AVAILABLE',
  create_store: 'AVAILABLE',
  structured_store_build: 'AVAILABLE',
  validate_store_context: 'AVAILABLE',
  create_promotion: 'PARTIAL', // requires store; usable after onboarding
  launch_campaign: 'STUBBED', // campaign deploy stub per convergence audit
  create_campaign: 'PARTIAL',
  publish_to_social: 'PARTIAL', // requires store + OAuth for auto-post
  connect_social_account: 'PARTIAL',
  analyze_store: 'PARTIAL',
  edit_artifact: 'PARTIAL', // localization path exists but needs store
  generate_mini_website: 'AVAILABLE',
};

/** Capabilities Cardbey must NOT claim for prospects */
const UNAVAILABLE_FOR_MARKET_INTENT = new Set([
  'find_nearby_partners', // discover stub — no runtime partner graph
  'issue_invoice',
  'issue_quote',
  'redeem_reward',
]);

const NEED_TAG_MAP: Record<string, string[]> = {
  market_research: [
    'market_access',
    'distributor',
    'customer',
    'expansion',
    'growth',
    'research',
    'audience',
    'competitor',
    'partner',
    'investor',
  ],
  create_store: ['online_presence', 'business', 'launch', 'store', 'presence', 'customer'],
  structured_store_build: ['online_presence', 'business', 'launch', 'store', 'catalog', 'offering'],
  create_promotion: ['promotion', 'marketing', 'customer', 'growth', 'content', 'sell'],
  publish_to_social: ['promotion', 'distribution', 'marketing', 'social', 'customer', 'reach'],
  launch_campaign: ['promotion', 'marketing', 'campaign', 'customer', 'growth'],
  edit_artifact: ['localization', 'translation', 'promotion', 'content', 'vietnamese', 'english'],
  generate_mini_website: ['online_presence', 'website', 'business', 'launch'],
  analyze_store: ['growth', 'improvement', 'customer', 'audit'],
  connect_social_account: ['distribution', 'social', 'promotion'],
};

function inferAvailability(toolName: string, entry: (typeof INTAKE_TOOL_REGISTRY)[number]): CapabilityAvailability {
  if (UNAVAILABLE_FOR_MARKET_INTENT.has(toolName)) return 'UNAVAILABLE';
  if (AVAILABILITY_OVERRIDES[toolName]) return AVAILABILITY_OVERRIDES[toolName];
  if (entry.riskLevel === RISK.DESTRUCTIVE) return 'PARTIAL';
  return 'AVAILABLE';
}

function buildNeedTags(toolName: string, description: string): string[] {
  const seeded = NEED_TAG_MAP[toolName] ?? [];
  const fromDesc = description
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 4);
  return [...new Set([...seeded, ...fromDesc.slice(0, 8)])];
}

let cachedCatalog: MarketCapabilityDefinition[] | null = null;

/**
 * Market-relevant capabilities from authoritative intakeToolRegistry.
 */
export function getMarketCapabilityCatalog(): MarketCapabilityDefinition[] {
  if (cachedCatalog) return cachedCatalog;

  const relevantToolNames = new Set([
    'market_research',
    'create_store',
    'structured_store_build',
    'validate_store_context',
    'create_promotion',
    'launch_campaign',
    'create_campaign',
    'publish_to_social',
    'connect_social_account',
    'edit_artifact',
    'generate_mini_website',
    'analyze_store',
    'audit_store_completeness',
    'prepare_catalog',
  ]);

  cachedCatalog = INTAKE_TOOL_REGISTRY.filter((t) => relevantToolNames.has(t.toolName)).map(
    (entry) => {
      const availability = inferAvailability(entry.toolName, entry);
      const limitations: string[] = [];
      if (entry.requiresStore) {
        limitations.push('Requires existing Cardbey store — prospect must onboard first');
      }
      if (availability === 'STUBBED') {
        limitations.push('Campaign deploy path is stubbed — not fully production-wired');
      }
      if (availability === 'PARTIAL' && entry.toolName === 'publish_to_social') {
        limitations.push('Auto-post requires connected social OAuth; share links always available');
      }
      return {
        capabilityId: entry.toolName,
        capabilityName: entry.label,
        semanticDescription: entry.semanticDescription ?? entry.label,
        availability,
        requiresStore: Boolean(entry.requiresStore),
        approvalRequired: Boolean(entry.approvalRequired),
        riskLevel: entry.riskLevel,
        executionPath: entry.executionPath,
        prerequisiteTools: entry.prerequisiteTools ?? [],
        limitations,
        needTags: buildNeedTags(entry.toolName, entry.semanticDescription ?? ''),
      };
    },
  );

  return cachedCatalog;
}

export function getMarketCapabilityById(id: string): MarketCapabilityDefinition | undefined {
  return getMarketCapabilityCatalog().find((c) => c.capabilityId === id);
}

export function resetMarketCapabilityCatalogForTests(): void {
  cachedCatalog = null;
}

/** Documented unavailable desired capabilities (not in registry as real tools) */
export const UNAVAILABLE_DESIRED_CAPABILITIES = [
  {
    needKey: 'distributor',
    label: 'Automated distributor matching',
    reason: 'No runtime partner/distributor matching capability exists',
  },
  {
    needKey: 'partner',
    label: 'Direct partner/franchise matching',
    reason: 'No runtime partner/franchise matching capability exists',
  },
  {
    needKey: 'investor',
    label: 'Investor matching',
    reason: 'No investment matching or fundraising capability in intake registry',
  },
  {
    needKey: 'co_founder',
    label: 'Co-founder recruitment',
    reason: 'No talent/co-founder matching capability in intake registry',
  },
  {
    needKey: 'direct_customer_acquisition',
    label: 'Guaranteed customer delivery',
    reason: 'Cardbey provides marketing tools, not direct customer acquisition guarantees',
  },
] as const;

export function getToolAuthorityEntry(toolName: string) {
  return getToolEntry(toolName);
}
