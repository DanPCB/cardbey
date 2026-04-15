/**
 * Derive Performer role and mission phase from intake context (hints only — not a planner).
 */

import type { CapabilityMissionPhase, PerformerRole } from './types.ts';

export interface RoleContextInput {
  userMessage: string;
  tool?: string | null;
  executionPath?: string | null;
  intentFamily?: string | null;
  intentSubtype?: string | null;
  hasStoreId?: boolean;
  hasDraftId?: boolean;
}

export interface RoleContextResult {
  role: PerformerRole;
  phase: CapabilityMissionPhase;
}

const QUOTE_RE = /\b(quote|invoice|estimate|quotation|proforma)\b/i;
const RESEARCH_RE = /\b(supplier|vendor|sourcing|compare|research|benchmark)\b/i;

export function deriveRoleAndPhase(input: RoleContextInput): RoleContextResult {
  const msg = String(input.userMessage ?? '').toLowerCase();
  const tool = String(input.tool ?? '').trim();
  const family = String(input.intentFamily ?? '').toLowerCase();

  let role: PerformerRole = 'generic_operator';
  let phase: CapabilityMissionPhase = 'understand';

  if (tool === 'create_store' || tool === 'generate_mini_website' || /mini\s*website|create\s+a\s+store/i.test(msg)) {
    role = 'business_launcher';
    phase = 'plan';
  } else if (
    tool === 'launch_campaign' ||
    tool === 'create_promotion' ||
    tool === 'market_research' ||
    family.includes('campaign') ||
    /campaign|promo|promotion|ads?\b/i.test(msg)
  ) {
    role = 'campaign_manager';
    phase = tool === 'market_research' ? 'plan' : 'execute';
  } else if (QUOTE_RE.test(msg)) {
    role = 'buyer_concierge';
    phase = 'plan';
  } else if (RESEARCH_RE.test(msg) || tool === 'analyze_store') {
    role = 'research_agent';
    phase = 'plan';
  } else if (
    tool === 'edit_artifact' ||
    tool === 'smart_visual' ||
    tool === 'generate_social' ||
    /content|caption|post|image|hero/i.test(msg)
  ) {
    role = 'content_creator';
    phase = 'execute';
  } else if (input.hasStoreId) {
    role = 'store_operator';
    phase = input.hasDraftId ? 'validate' : 'execute';
  }

  if (input.executionPath === 'clarify') {
    phase = 'understand';
  }
  if (input.executionPath === 'proactive_plan') {
    phase = 'plan';
  }

  return { role, phase };
}
