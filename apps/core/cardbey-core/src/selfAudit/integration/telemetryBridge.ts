/**
 * Bridge between self-audit and Mission Console telemetry buffers.
 */

import { getMissionConsoleTelemetryBuffers } from '../../lib/orchestrator/missionConsoleTelemetryStore.js';
import { isPipelineOutputDualWriteEnabled } from '../../lib/orchestrator/pipelineCanonicalResults.js';
import type { AuditContext, AuditIssue } from '../detectors/base.detector.js';
import {
  buildTelemetryReview,
  deriveTelemetryFixIssues,
  type TelemetryFixIssue,
  type TelemetryIssueCategory,
} from './telemetryReview.js';

const CATEGORY_MAP: Record<TelemetryIssueCategory, AuditIssue['category']> = {
  orchestra_mirror_gap: 'api',
  planner_missing_context: 'agent',
  performer_result_shape: 'api',
  telemetry_stream_missing: 'performance',
  admin_tool_discovery: 'routing',
};

/**
 * Load telemetry buffers from in-memory store and merge into audit context.
 */
export function enrichContextWithTelemetry(context: AuditContext): AuditContext {
  const buffers = getMissionConsoleTelemetryBuffers();
  return {
    ...context,
    telemetryBuffers: {
      pipelineWrites: buffers.pipelineWrites,
      intentPlans: buffers.intentPlans,
      executionEvents: buffers.executionEvents,
      resultConsistency: context.telemetryBuffers?.resultConsistency ?? [],
      pipelineOutputDualWrite: isPipelineOutputDualWriteEnabled(),
    },
  };
}

/**
 * Convert telemetry fix issues to audit issues.
 */
export function telemetryFixIssueToAuditIssue(issue: TelemetryFixIssue): AuditIssue {
  return {
    id: `telemetry-${issue.category}-${issue.id}`,
    category: CATEGORY_MAP[issue.category] ?? 'api',
    severity: issue.severity,
    title: issue.title,
    description: issue.summary,
    location: `telemetry:${issue.category}`,
    evidence: { evidence: issue.evidence, confidence: issue.confidence },
    suggestedFix: `Apply telemetry playbook: ${issue.playbookId}`,
    autoFixable: true,
    timestamp: new Date().toISOString(),
    telemetryId: issue.id,
  };
}

/**
 * Derive audit issues from telemetry buffers in context.
 */
export function deriveTelemetryAuditIssues(context: AuditContext): AuditIssue[] {
  const buffers = context.telemetryBuffers ?? getMissionConsoleTelemetryBuffers();
  const pipelineWrites = (buffers.pipelineWrites ?? []) as Array<{ source: string }>;
  const intentPlans = (buffers.intentPlans ?? []) as Array<{
    ok: boolean;
    inputHash: string;
    planHash?: string;
  }>;
  const resultConsistency = (buffers.resultConsistency ?? []) as Array<{
    outputsJsonPresent?: boolean;
    mismatch?: boolean;
  }>;
  const executionEvents = (buffers.executionEvents ?? []) as Array<{
    execution_source?: string;
    execution_type?: string;
  }>;

  const input = {
    pipelineWrites,
    intentPlans,
    resultConsistency,
    executionEvents,
    pipelineOutputDualWrite: buffers.pipelineOutputDualWrite ?? isPipelineOutputDualWriteEnabled(),
  };

  const review = buildTelemetryReview(input);
  const fixIssues = deriveTelemetryFixIssues({ ...input, review });
  return fixIssues.map(telemetryFixIssueToAuditIssue);
}

/**
 * Telemetry bridge sync status for API.
 */
export function getTelemetryBridgeStatus(): {
  enabled: boolean;
  bufferSizes: { pipelineWrites: number; intentPlans: number; executionEvents: number };
  dualWrite: boolean;
} {
  const buffers = getMissionConsoleTelemetryBuffers();
  const storeEnabled =
    String(process.env.MISSION_CONSOLE_TELEMETRY_STORE ?? '').trim().toLowerCase() !== 'false';
  return {
    enabled: storeEnabled,
    bufferSizes: {
      pipelineWrites: buffers.pipelineWrites.length,
      intentPlans: buffers.intentPlans.length,
      executionEvents: buffers.executionEvents.length,
    },
    dualWrite: isPipelineOutputDualWriteEnabled(),
  };
}
