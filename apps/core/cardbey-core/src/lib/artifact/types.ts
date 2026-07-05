/**
 * Intent-to-Artifact compiler types.
 * Shapes align with dashboard TopologyReviewCard / topologyReviewModel.ts.
 */

/** Single execution step in a compiled topology. */
export type TopologyNode = {
  id: string;
  toolName: string;
  orderIndex: number;
  labels?: { en?: string; [locale: string]: string | undefined };
  label?: string;
  config?: Record<string, unknown>;
  dependsOn?: string[];
};

/** Directed dependency between topology nodes. */
export type TopologyEdge = {
  from: string;
  to: string;
  type?: 'depends_on' | 'parallel' | 'sequential';
};

export type TopologyArtifactMetadata = {
  intent?: string;
  storeId?: string | null;
  sessionId?: string | null;
  compiledAt?: string;
  compilerVersion?: string;
  agentCount?: number;
  nodeCount?: number;
  orchestrationKind?: string;
};

/** Compiled execution graph for HITL review. */
export type TopologyArtifact = {
  id: string;
  version: string;
  missionType: string;
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  metadata?: TopologyArtifactMetadata;
};

export type PolicyGate = {
  type: 'manual_approval' | 'confirmation_required' | 'governance' | string;
  nodeId?: string;
  tool?: string;
  reason?: string;
  who?: string;
};

export type PolicyRisk = {
  risk?: string;
  mitigation?: string;
  severity?: 'low' | 'medium' | 'high';
  nodeId?: string;
};

export type PolicyDefaults = {
  requiresConfirmation?: boolean;
  autoRun?: boolean;
  [key: string]: unknown;
};

/** Governance and approval gates derived from topology. */
export type PolicyArtifact = {
  id: string;
  version: string;
  gates: PolicyGate[];
  risks: PolicyRisk[];
  defaults?: PolicyDefaults;
};

export type ReasoningChainEntry = {
  step?: string;
  agentType?: string;
  toolName?: string;
  rationale?: string;
};

export type ReasoningPhase = {
  name?: string;
  description?: string;
  duration?: string;
  steps?: number;
  nodeIds?: string[];
};

export type ReasoningKeyDecision = {
  decision?: string;
  reason?: string;
};

export type ReasoningTradeoff = {
  what?: string;
  why?: string;
};

export type ReasoningTimeline = {
  estimatedMinutes?: number;
  criticalPath?: string[];
  parallelWork?: string[];
};

export type ReasoningArtifactMetadata = {
  nodeCount?: number;
  agentCount?: number;
  refinementIterations?: number;
  qualityScore?: number;
};

/** Human-readable plan explanation for TopologyReviewCard. */
export type ReasoningArtifact = {
  id: string;
  version: string;
  summary: string;
  chain: ReasoningChainEntry[];
  phases: ReasoningPhase[];
  keyDecisions: ReasoningKeyDecision[];
  tradeoffs: ReasoningTradeoff[];
  timeline?: ReasoningTimeline;
  risks?: Array<{ risk?: string; mitigation?: string }>;
  approvalGates?: Array<{ step?: string; what?: string; who?: string }>;
  nextSteps?: string[];
  metadata?: ReasoningArtifactMetadata;
};

export type ToolContractRef = {
  toolName: string;
  nodeId: string;
  requiredParams?: string[];
  optionalParams?: string[];
};

/** Full compile output consumed by validators, metadata writer, and UI. */
export type ArtifactBundle = {
  topology: TopologyArtifact;
  policy: PolicyArtifact;
  reasoning: ReasoningArtifact;
  toolContracts?: ToolContractRef[];
};

export type CompileIntent = {
  text: string;
  tool: string;
  missionType?: string;
  storeId?: string | null;
  parameters?: Record<string, unknown>;
};

export type CompileContext = {
  missionId: string;
  sessionId?: string | null;
  storeId?: string | null;
  userId?: string | null;
  tenantKey?: string;
  locale?: string;
  orchestrationKind?: string;
};

export type ValidationResult = {
  ok: boolean;
  errors?: string[];
  warnings?: string[];
};

export type CompileWithMultiAgentResult = {
  missionId: string;
  artifactBundle: ArtifactBundle;
  validation: ValidationResult;
};

export const ARTIFACT_COMPILER_VERSION = '1.0.0';
