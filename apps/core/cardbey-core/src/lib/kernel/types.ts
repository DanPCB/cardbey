/**
 * Cardbey AI Operating Kernel — Phase 0 types.
 * Constitutional spec: docs/COGNITIVE_KERNEL_SPEC.md
 *
 * Phase 0: definitions only. No production wiring.
 */

/** Mission families — canonical enum; not tool names. */
export type MissionFamily =
  | 'campaign'
  | 'loyalty'
  | 'offer'
  | 'store'
  | 'catalog'
  | 'menu'
  | 'signage'
  | 'video'
  | 'content'
  | 'booking'
  | 'generic';

/** Capability vocabulary — runtime dispatches these, not tool names. */
export type CapabilityId =
  | 'LoadContext'
  | 'Analyze'
  | 'Infer'
  | 'Ask'
  | 'Generate'
  | 'Validate'
  | 'Persist'
  | 'Publish';

/** Append-only event on a Reality Stream. Immutable after record. */
export type RealityStreamEventKind =
  | 'user_upload'
  | 'user_message'
  | 'user_voice'
  | 'session_context'
  | 'store_signal'
  | 'order_placed'
  | 'loyalty_scan'
  | 'inventory_change'
  | 'campaign_published'
  | 'asset_published'
  | 'signage_update'
  | 'external_signal'
  | 'ocr_output'
  | 'vision_output'
  | 'custom';

/** Raw observation — detector output without mission classification. */
export type RealityObservation = {
  observationId: string;
  kind: string;
  payload: Record<string, unknown>;
  detector: string;
  confidence?: number;
};

/** Single append-only event. Law 1: never mutate after append. */
export type RealityStreamEvent = {
  eventId: string;
  streamId: string;
  recordedAt: string;
  kind: RealityStreamEventKind;
  /** Blob ref, message id, store signal id, etc. */
  payloadRef?: string | null;
  observations: RealityObservation[];
  metadata?: Record<string, unknown>;
};

/** Window into a stream — missions select a slice of time/events. */
export type RealityStreamWindow = {
  streamId: string;
  fromEventId?: string | null;
  toEventId?: string | null;
  fromTime?: string | null;
  toTime?: string | null;
};

/**
 * Evidence View — frozen query over Reality Stream (not duplicated facts).
 * Law 1: view definition is immutable once frozenAt is set.
 */
export type EvidenceView = {
  evidenceId: string;
  realityStreamId: string;
  window: RealityStreamWindow;
  eventIds: string[];
  observationIds: string[];
  queryVersion: string;
  selectionReason: string;
  frozenAt: string;
};

/** Perception interpretation — mutable, versioned, replayable from stream. */
export type PerceptionFrame = {
  frameId: string;
  streamId: string;
  window: RealityStreamWindow;
  pluginId: string;
  pluginVersion: string;
  createdAt: string;
  interpretations: Array<{
    label: string;
    entityKind?: string;
    confidence: number;
    observationIds: string[];
  }>;
};

/** Experience signal — platform-learned (aggregated outcomes). */
export type ExperienceSignal = {
  providerId: string;
  topic: string;
  payload: Record<string, unknown>;
  confidence: number;
  sampleSize?: number;
};

/** Knowledge signal — imported static domain reference. */
export type KnowledgeSignal = {
  providerId: string;
  topic: string;
  payload: Record<string, unknown>;
  source?: string;
};

/** Ranked mission option — observable output of reasoning. Proposes only; Decision chooses. */
export type AlternativeMission = {
  id: string;
  label: string;
  missionFamily: MissionFamily;
  /** Performer tool name for parity comparison (Phase 2); not execution authority. */
  toolHint?: string;
  score: number;
  rationale?: string;
  supportingObservationIds?: string[];
  supportingEvidenceIds?: string[];
};

/** Reasoning frame — mutable until decision. */
export type ReasoningFrame = {
  frameId: string;
  evidenceId: string;
  createdAt: string;
  userGoal?: string | null;
  inferredGoals: Array<{ id: string; label: string; confidence: number }>;
  alternatives: AlternativeMission[];
  ambiguities?: Array<{ conflict: string; clarifyQuestion: string }>;
  risks?: Array<{ id: string; severity: string; message?: string }>;
  opportunities?: Array<{ id: string; label: string }>;
  experienceConsulted: string[];
  knowledgeConsulted: string[];
  confidence: number;
};

/** Decision outcome — leads to contract freeze. */
export type DecisionResult = {
  decisionId: string;
  selectedAlternativeId: string;
  missionFamily: MissionFamily;
  confidence: number;
  userConfirmed: boolean;
  decidedAt: string;
};

/**
 * Mission Contract — Law 2: immutable after frozenAt.
 * Nothing downstream may change missionFamily or userGoalSnapshot.
 */
export type MissionContract = {
  contractId: string;
  missionId: string;
  frozenAt: string;

  missionFamily: MissionFamily;
  selectedAlternativeId: string;
  userGoalSnapshot: string;

  evidenceId: string;
  reasoningFrameId: string;
  decisionId: string;

  executionContext: {
    storeId?: string | null;
    spaceId?: string | null;
    userId?: string | null;
    storeLocked: boolean;
    selectionMethod?: string | null;
  };

  builderId: string;
  allowedCapabilities: CapabilityId[];
  expectedAssetTypes: string[];
  uiCardFamily: string;
  publishPipelineId: string;

  kernelVersion: string;
};

/** Living execution graph — structure frozen; state evolves separately. */
export type LivingExecutionGraphStructure = {
  graphId: string;
  contractId: string;
  missionFamily: MissionFamily;
  frozenAt: string;
  nodes: Array<{
    id: string;
    capability: CapabilityId;
    orderIndex: number;
    dependsOn: string[];
    labels?: { en?: string };
  }>;
  edges: Array<{ from: string; to: string }>;
};

export type LivingExecutionGraphState = {
  graphId: string;
  nodeStatus: Record<string, 'pending' | 'running' | 'completed' | 'failed' | 'needs_input' | 'skipped'>;
  nodeOutputs: Record<string, unknown>;
  executionDraft?: Record<string, unknown>;
  awaitingOwnerInput?: boolean;
  pendingNodeId?: string | null;
  updatedAt: string;
};

/** Published business asset — immutable version. */
export type BusinessAsset = {
  assetId: string;
  contractId: string;
  graphId: string;
  assetType: string;
  version: string;
  publishedAt: string;
  storageRef: string;
  metadata?: Record<string, unknown>;
};

/** Full mission audit trail for replay. */
export type KernelAuditTrail = {
  missionId: string;
  streamId: string;
  evidenceId: string;
  perceptionFrameIds: string[];
  reasoningFrameId: string;
  decisionId: string;
  contractId: string;
  graphStructureId: string;
  assetIds: string[];
};

/**
 * Phase 2 — immutable bundle from passive cognitive pipeline.
 * Observed alongside Performer; not consumed for routing until Phase 3.
 */
export type PassiveCognitiveRun = {
  runId: string;
  streamId: string;
  createdAt: string;
  ingestCorrelationId?: string | null;
  perceptionFrame: PerceptionFrame;
  evidenceView: EvidenceView;
  reasoningFrame: ReasoningFrame;
};

/** Phase 2 parity log — kernel alternatives vs Performer classification. */
export type CognitiveParityAgreement = 'top1' | 'top3' | 'disagree' | 'no_kernel_run';

export type CognitiveParityRecord = {
  parityId: string;
  streamId: string;
  runId: string | null;
  recordedAt: string;
  performerTool: string | null;
  performerConfidence: number | null;
  /** IntentReasoner tool before intake overrides (when captured). */
  intentReasonerTool: string | null;
  classificationSource: string | null;
  kernelTopTool: string | null;
  kernelTopScore: number | null;
  topKernelAlternative: AlternativeMission | null;
  /** @deprecated use agreement */
  agrees: boolean;
  agreement: CognitiveParityAgreement;
  top1Agrees: boolean;
  top3Agrees: boolean;
  tags: string[];
  alternatives: AlternativeMission[];
};

/** Rolling parity metrics for observe/compare gate (Phase 3). */
export type CognitiveParityMetrics = {
  windowStartedAt: string | null;
  windowEndedAt: string | null;
  totalComparisons: number;
  withKernelRun: number;
  top1AgreementPct: number;
  top3AgreementPct: number;
  disagreementCount: number;
  disagreementExamples: CognitiveParityRecord[];
  attachmentHijackCases: CognitiveParityRecord[];
  campaignVsLoyaltyConflicts: CognitiveParityRecord[];
};
