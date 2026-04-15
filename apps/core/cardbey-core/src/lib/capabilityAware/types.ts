/**
 * Canonical capability-aware contracts for Performer v1.
 * Planning/policy only — no execution or submission side effects in this package.
 */

export type CapabilityTier = 'standard' | 'premium';

export type CapabilityExecutor =
  | 'internal_tool'
  | 'internal_agent'
  | 'external_integration'
  | 'pag_service'
  | 'child_agent';

export type CapabilityStatus = 'ready' | 'partial' | 'experimental' | 'disabled';

export interface CapabilityDefinition {
  id: string;
  name: string;
  description: string;
  category: string;
  tier: CapabilityTier;
  executor: CapabilityExecutor;
  status: CapabilityStatus;
  supportedRoles: string[];
  inputs: string[];
  outputs: string[];
  requiresAuth: boolean;
  requiresApproval: boolean;
  supportsGuest: boolean;
  ppsCost?: number;
  qualityLevel?: 'low' | 'medium' | 'high' | 'premium';
  fallbackCapabilityIds?: string[];
  substituteFor?: string[];
  riskLevel?: 'low' | 'medium' | 'high';
}

export type PerformerRole =
  | 'business_launcher'
  | 'store_operator'
  | 'content_creator'
  | 'campaign_manager'
  | 'research_agent'
  | 'buyer_concierge'
  | 'generic_operator';

export type CapabilityMissionPhase =
  | 'understand'
  | 'plan'
  | 'check_capabilities'
  | 'acquire'
  | 'execute'
  | 'validate'
  | 'continue'
  | 'blocked';

export interface MissionRequirement {
  id: string;
  name: string;
  category: string;
  requiredFor: string;
  importance: 'critical' | 'important' | 'optional';
  expectedOutput: string;
}

export type RequirementState =
  | 'ready'
  | 'partial'
  | 'missing'
  | 'fetchable'
  | 'substitutable'
  | 'delegatable'
  | 'blocked';

export interface RequirementResolution {
  requirementId: string;
  state: RequirementState;
  matchedCapabilityId?: string;
  fallbackCapabilityId?: string;
  suggestedChildRole?: string;
  requiresUserInput?: boolean;
  notes?: string;
}

export type ExecutionMode =
  | 'standard'
  | 'premium'
  | 'fallback'
  | 'child_agent'
  | 'user_input'
  | 'blocked';

export interface ExecutionChoice {
  requirementId: string;
  chosenMode: ExecutionMode;
  capabilityId?: string;
  reason: string;
  estimatedCost?: number;
  approvalRequired?: boolean;
  /** Additive: standard path chosen but quality/deps degraded (v1 hardening). */
  isDegraded?: boolean;
}

export interface ChildAgentTask {
  id: string;
  role: 'research_child' | 'asset_child' | 'tooling_child' | 'validation_child' | 'reporting_child';
  missionId: string;
  parentRequirementId: string;
  objective: string;
  inputs: Record<string, unknown>;
  expectedOutputs: string[];
  maxIterations?: number;
  maxToolCalls?: number;
  maxRuntimeMs?: number;
  /** v1: nested delegation disallowed; omit or false only. */
  allowNestedDelegation?: false;
}

export type PremiumUsageMode =
  | 'standard_only'
  | 'suggest_premium'
  | 'user_selected_premium'
  | 'auto_premium_with_limit';

export interface PremiumRoutingDecision {
  allowed: boolean;
  mode: PremiumUsageMode;
  recommended: boolean;
  reason: string;
  estimatedPpsCost?: number;
}

export type AcquisitionStatus =
  | 'not_needed'
  | 'pending'
  | 'acquired'
  | 'substituted'
  | 'delegated'
  | 'awaiting_user'
  | 'blocked';

export interface CapabilityAcquisitionState {
  requirementId: string;
  status: AcquisitionStatus;
  chosenPath?: ExecutionMode;
  notes?: string;
}

export interface CapabilityAssessmentSummary {
  role: PerformerRole;
  phase: CapabilityMissionPhase;
  requirements: MissionRequirement[];
  resolutions: RequirementResolution[];
  executionChoices: ExecutionChoice[];
  premiumDecision?: PremiumRoutingDecision;
  acquisitionStates?: CapabilityAcquisitionState[];
  generatedAt: string;
  /** Intake kernel version marker for clients. */
  schemaVersion: 1;
}
