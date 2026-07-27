/**
 * Phase 3 — build immutable DecisionRecord from parity/calibration inputs.
 */

import { randomUUID } from 'node:crypto';
import type { AlternativeMission } from '../types.js';
import { getLatestPassiveCognitiveRun } from '../passive/persist.js';
import { buildDecisionExplanation } from './buildDecisionExplanation.js';
import { calculateConfidenceDelta } from './confidenceDelta.js';
import { classifyDisagreement, requiresHumanReview } from './classifyDisagreement.js';
import { saveDecisionRecord } from './calibrationStore.js';
import type {
  AgreementStatus,
  BuildDecisionRecordInput,
  DecisionAlternativeSnapshot,
  DecisionRecord,
} from './decisionRecord.types.js';
import { toolToMissionFamily } from './toolFamily.js';

function snapshotAlternative(alt: AlternativeMission): DecisionAlternativeSnapshot {
  return {
    id: alt.id,
    label: alt.label,
    toolHint: alt.toolHint ?? null,
    family: alt.missionFamily ?? null,
    score: alt.score,
    rationale: alt.rationale ?? null,
  };
}

function selectedReason(input: BuildDecisionRecordInput, performerTool: string | null): string {
  const source = String(input.performerSource ?? '').trim();
  if (source.includes('loyalty_over') || source.includes('attachment_analysis')) {
    return 'Performer routing override after attachment analysis';
  }
  if (source) return `Performer classified via ${source}`;
  return 'Performer intake classification (IntentReasoner path)';
}

/**
 * Build, freeze, and persist a DecisionRecord. Passive only — never routes.
 */
export function buildDecisionRecord(input: BuildDecisionRecordInput): DecisionRecord | null {
  const streamId = String(input.streamId ?? '').trim() || null;
  const run = streamId ? getLatestPassiveCognitiveRun(streamId) : undefined;

  const kernelAlternatives: DecisionAlternativeSnapshot[] =
    input.kernelAlternatives?.length
      ? input.kernelAlternatives
      : (run?.reasoningFrame.alternatives ?? []).map(snapshotAlternative);

  const top = kernelAlternatives[0] ?? null;
  const performerTool = String(input.performerTool ?? '').trim() || null;
  const kernelTopTool = String(top?.toolHint ?? '').trim() || null;

  const agreement: AgreementStatus = input.agreement;
  const tags = [...new Set(input.tags ?? [])];

  const disagreementReason = classifyDisagreement({
    userText: input.userText,
    performerTool,
    intentReasonerTool: input.intentReasonerTool,
    kernelTopTool,
    kernelAlternatives,
    tags,
    attachmentSignals: input.attachmentSignals,
    agreement,
  });

  const confidence = calculateConfidenceDelta({
    performerConfidence: input.performerConfidence,
    kernelTopScore: top?.score ?? null,
  });

  const explanation = buildDecisionExplanation({
    userText: input.userText,
    performerTool,
    intentReasonerTool: input.intentReasonerTool,
    kernelAlternatives,
    agreement,
    tags,
    disagreementReason,
    kernelTopTool,
    topLabel: top?.label ?? null,
  });

  const humanReview = requiresHumanReview(agreement, disagreementReason, tags);

  const record: DecisionRecord = {
    decisionRecordId: randomUUID(),
    createdAt: new Date().toISOString(),
    streamId,
    evidenceId: input.evidenceId ?? run?.evidenceView.evidenceId ?? null,
    reasoningFrameId: input.reasoningFrameId ?? run?.reasoningFrame.frameId ?? null,
    userText: input.userText ?? null,
    performer: {
      tool: performerTool,
      family: input.performerFamily ?? toolToMissionFamily(performerTool),
      confidence: confidence.performerConfidence,
      source: input.performerSource ?? null,
      intentReasonerTool: input.intentReasonerTool ?? null,
    },
    kernel: {
      topAlternative: top,
      alternatives: kernelAlternatives,
    },
    calibration: {
      agreement,
      confidenceDelta: confidence.delta,
      disagreementReason,
      explanation,
      tags,
      requiresHumanReview: humanReview,
    },
    selected: {
      source: 'performer',
      tool: performerTool,
      family: input.performerFamily ?? toolToMissionFamily(performerTool),
      reason: selectedReason(input, performerTool),
    },
    frozen: true,
  };

  const persisted = saveDecisionRecord(record);

  console.info('[KernelCognitive] decision_record', {
    decisionRecordId: persisted.decisionRecordId,
    agreement: persisted.calibration.agreement,
    disagreementReason: persisted.calibration.disagreementReason,
    performerTool: persisted.performer.tool,
    kernelTopTool: persisted.kernel.topAlternative?.toolHint ?? null,
    confidenceDelta: persisted.calibration.confidenceDelta,
    tags: persisted.calibration.tags,
    requiresHumanReview: persisted.calibration.requiresHumanReview,
  });

  return persisted;
}

/**
 * Build DecisionRecord from Phase 2 parity output shape.
 */
export function buildDecisionRecordFromParity(args: {
  streamId: string;
  userText?: string | null;
  performerTool?: string | null;
  performerConfidence?: number | null;
  performerSource?: string | null;
  intentReasonerTool?: string | null;
  agreement: AgreementStatus;
  tags?: string[];
  kernelAlternatives?: DecisionAlternativeSnapshot[];
  attachmentSignals?: BuildDecisionRecordInput['attachmentSignals'];
}): DecisionRecord | null {
  return buildDecisionRecord({
    streamId: args.streamId,
    userText: args.userText,
    performerTool: args.performerTool,
    performerConfidence: args.performerConfidence,
    performerSource: args.performerSource,
    intentReasonerTool: args.intentReasonerTool,
    agreement: args.agreement,
    tags: args.tags,
    kernelAlternatives: args.kernelAlternatives,
    attachmentSignals: args.attachmentSignals,
  });
}
