/**
 * Phase 3 — Decision Calibration types.
 * @see docs/COGNITIVE_KERNEL_SPEC.md
 */

import type { MissionFamily } from '../types.js';

export type DecisionSource =
  | 'performer'
  | 'kernel'
  | 'user_confirmed'
  | 'manual_override';

export type AgreementStatus = 'top1' | 'top3' | 'disagree' | 'no_kernel_run';

export type DisagreementReason =
  | 'explicit_user_wording'
  | 'missing_context'
  | 'knowledge_gap'
  | 'vision_ambiguity'
  | 'ocr_ambiguity'
  | 'plugin_disagreement'
  | 'rule_conflict'
  | 'runtime_override'
  | 'performer_bug'
  | 'kernel_bug'
  | 'user_changed_intent'
  | 'clarification_required'
  | 'unknown';

export type DecisionAlternativeSnapshot = {
  id: string;
  label: string;
  toolHint?: string | null;
  family?: MissionFamily | null;
  score: number;
  rationale?: string | null;
};

export type DecisionRecord = {
  decisionRecordId: string;
  createdAt: string;

  streamId?: string | null;
  evidenceId?: string | null;
  reasoningFrameId?: string | null;

  userText?: string | null;

  performer: {
    tool?: string | null;
    family?: MissionFamily | null;
    confidence?: number | null;
    source?: string | null;
    intentReasonerTool?: string | null;
  };

  kernel: {
    topAlternative?: DecisionAlternativeSnapshot | null;
    alternatives: DecisionAlternativeSnapshot[];
  };

  calibration: {
    agreement: AgreementStatus;
    confidenceDelta?: number | null;
    disagreementReason?: DisagreementReason | null;
    explanation: string;
    tags: string[];
    requiresHumanReview: boolean;
  };

  selected: {
    source: DecisionSource;
    tool?: string | null;
    family?: MissionFamily | null;
    reason: string;
  };

  frozen: true;
};

export type ConfidenceDeltaResult = {
  performerConfidence: number | null;
  kernelTopScore: number | null;
  delta: number | null;
  strongerSide: 'performer' | 'kernel' | 'equal' | 'unknown';
};

export type ClassifyDisagreementInput = {
  userText?: string | null;
  performerTool?: string | null;
  intentReasonerTool?: string | null;
  kernelTopTool?: string | null;
  kernelAlternatives?: DecisionAlternativeSnapshot[];
  tags?: string[];
  attachmentSignals?: {
    ocrWeak?: boolean;
    ocrFailed?: boolean;
    visionAmbiguous?: boolean;
    missingStore?: boolean;
  };
  agreement: AgreementStatus;
};

export type BuildDecisionRecordInput = {
  streamId?: string | null;
  evidenceId?: string | null;
  reasoningFrameId?: string | null;
  userText?: string | null;
  performerTool?: string | null;
  performerFamily?: MissionFamily | null;
  performerConfidence?: number | null;
  performerSource?: string | null;
  intentReasonerTool?: string | null;
  kernelAlternatives?: DecisionAlternativeSnapshot[];
  agreement: AgreementStatus;
  tags?: string[];
  attachmentSignals?: ClassifyDisagreementInput['attachmentSignals'];
};

export type DecisionCalibrationMetrics = {
  total: number;
  top1AgreementPct: number;
  top3AgreementPct: number;
  disagreementPct: number;
  unexplainedDisagreementCount: number;
  disagreementReasons: Partial<Record<DisagreementReason, number>>;
  tagCounts: Record<string, number>;
  campaignVsLoyaltyConflicts: number;
  attachmentHijackCases: number;
  highConfidenceDisagreements: number;
  closeCallCases: number;
  readiness: {
    gate1Agreement: boolean;
    gate2AllDisagreementsClassified: boolean;
    gate3NoUnexplained14Days: boolean;
    readyForAuthority: boolean;
  };
  examples: {
    disagreements: DecisionRecord[];
    unexplained: DecisionRecord[];
    highConfidence: DecisionRecord[];
  };
};
