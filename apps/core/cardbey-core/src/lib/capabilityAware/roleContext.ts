/**
 * Derive Performer role and mission phase from intake context (hints only — not a planner).
 */

import type { CapabilityMissionPhase, PerformerRole } from './types.ts';

export function deriveRole(
  intentType: string,
  _artifacts?: string[],
): PerformerRole {
  const intent = String(intentType ?? '').trim().toLowerCase();
  switch (intent) {
    case 'create_store':
    case 'store_setup':
      return 'business_launcher';
    case 'mini_website':
    case 'create_mini_website':
    case 'generate_mini_website':
    case 'edit_website':
      return 'content_creator';
    case 'launch_campaign':
      return 'campaign_manager';
    case 'campaign_research':
      return 'research_agent';
    case 'create_smart_document':
    case 'create_card':
      return 'concierge_operator';
    default:
      return 'generic_operator';
  }
}

export function derivePhase(
  missionStatus: string | null | undefined,
  _hasRequirements: boolean,
  hasGaps: boolean,
): CapabilityMissionPhase {
  if (hasGaps) return 'check_capabilities';
  const status = String(missionStatus ?? '').trim().toLowerCase();
  if (!status) return 'understand';
  if (status === 'requested' || status === 'planned') return 'plan';
  if (status === 'awaiting_confirmation') return 'check_capabilities';
  if (status === 'queued' || status === 'executing' || status === 'running') return 'execute';
  if (status === 'completed' || status === 'done') return 'validate';
  if (status === 'failed' || status === 'error') return 'blocked';
  return 'understand';
}

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

export function deriveRoleAndPhase(input: RoleContextInput): RoleContextResult {
  const role = deriveRole(String(input.tool ?? input.intentFamily ?? '').trim());
  const phase =
    input.executionPath === 'proactive_plan'
      ? 'plan'
      : input.executionPath === 'clarify'
        ? 'understand'
        : input.hasDraftId
          ? 'validate'
          : input.hasStoreId
            ? 'execute'
            : 'understand';
  return { role, phase };
}
