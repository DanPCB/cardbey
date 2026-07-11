/**
 * Apply telemetry fix playbooks to self-audit issues (governed proposals only).
 */

import {
  PATH_A_CODE_FIX_GUARDRAILS,
  buildTelemetryCodeFixDescription,
} from '../../lib/telemetry/telemetryCodeFixGuardrails.js';
import type { AuditIssue } from '../detectors/base.detector.js';
import type { FixPlan } from '../fixGenerators/base.fix.js';
import { appendFixRecord, type SelfAuditFixRecord } from '../fixHistory.js';

const TELEMETRY_PLAYBOOKS: Record<
  string,
  { id: string; category: string; likelyFiles: string[]; constraints: string[]; validationSteps: string[] }
> = {
  orchestra_mirror_gap: {
    id: 'orchestra_mirror_gap',
    category: 'orchestra_mirror_gap',
    likelyFiles: [
      'apps/core/cardbey-core/src/lib/orchestrator/pipelineCanonicalResults.js',
      'apps/core/cardbey-core/src/routes/performerIntakeV2Routes.js',
    ],
    constraints: ['Preserve dual-write gating', 'No auth changes'],
    validationSteps: ['Verify orchestra_store_build mirror in metadataJson.stepOutputs'],
  },
  planner_missing_context: {
    id: 'planner_missing_context',
    category: 'planner_missing_context',
    likelyFiles: [
      'apps/core/cardbey-core/src/multiAgent/agents/planner.agent.ts',
      'apps/core/cardbey-core/src/lib/multiAgent/deepseekIntakeBridge.ts',
    ],
    constraints: ['Preserve HITL gate', 'No auto-apply'],
    validationSteps: ['Confirm planner shadow events after pipeline writes'],
  },
  performer_result_shape: {
    id: 'performer_result_shape',
    category: 'performer_result_shape',
    likelyFiles: [
      'apps/dashboard/cardbey-marketing-dashboard/src/app/console/performer/useIntakeV2.ts',
      'apps/core/cardbey-core/src/routes/performerIntakeV2Routes.js',
    ],
    constraints: ['Backward compatible response shape'],
    validationSteps: ['Verify outputsJson present on mission pipeline samples'],
  },
  telemetry_stream_missing: {
    id: 'telemetry_stream_missing',
    category: 'telemetry_stream_missing',
    likelyFiles: [
      'apps/core/cardbey-core/src/lib/orchestrator/missionConsoleTelemetryStore.js',
    ],
    constraints: ['No PII in buffers'],
    validationSteps: ['Confirm MISSION_CONSOLE_TELEMETRY_STORE enabled'],
  },
  admin_tool_discovery: {
    id: 'admin_tool_discovery',
    category: 'admin_tool_discovery',
    likelyFiles: [
      'apps/core/cardbey-core/src/lib/telemetry/adminToolDiscoveryPlaybook.js',
    ],
    constraints: ['Super-admin only', 'Proposal only'],
    validationSteps: ['Review navigation discovery gaps'],
  },
};

/**
 * Build a governed fix plan from a telemetry-linked audit issue.
 */
export function buildPlaybookFixPlan(issue: AuditIssue): FixPlan | null {
  if (!issue.telemetryId) return null;

  const category = issue.telemetryId.split(':')[0] ?? issue.location.replace('telemetry:', '');
  const playbook = TELEMETRY_PLAYBOOKS[category];
  if (!playbook) return null;

  const telemetryIssue = {
    category,
    title: issue.title,
    severity: issue.severity,
    confidence: (issue.evidence.confidence as number) ?? 0.85,
    summary: issue.description,
    evidence: Array.isArray(issue.evidence.evidence)
      ? (issue.evidence.evidence as string[])
      : [issue.description],
    suggestedTool: 'code_fix' as const,
  };

  const description = buildTelemetryCodeFixDescription(
    telemetryIssue,
    playbook,
    { source: 'self_audit', issueId: issue.id },
  );

  return {
    issueId: issue.id,
    description,
    guardrails: { ...PATH_A_CODE_FIX_GUARDRAILS },
    status: 'proposed',
    files: playbook.likelyFiles.map((path) => ({
      path,
      content: '',
      patch: `# Governed proposal for ${issue.title}\n# ${description.slice(0, 500)}`,
    })),
    tests: playbook.validationSteps,
    playbookId: playbook.id,
  };
}

/**
 * Record fix outcome for drift tracking.
 */
export function recordFixOutcome(
  record: SelfAuditFixRecord,
  outcome: 'improved' | 'stable' | 'worsening' | 'waiting_validation',
): SelfAuditFixRecord {
  const updated: SelfAuditFixRecord = {
    ...record,
    status: outcome === 'improved' ? 'verified' : record.status,
    outcome,
    updatedAt: new Date().toISOString(),
  };
  appendFixRecord(updated);
  return updated;
}

/**
 * Compare fix outcome (simplified port of dashboard telemetryFixOutcomeCompare).
 */
export function compareFixOutcome(
  before: { issueCount: number },
  after: { issueCount: number },
): 'improved' | 'stable' | 'worsening' {
  if (after.issueCount < before.issueCount) return 'improved';
  if (after.issueCount > before.issueCount) return 'worsening';
  return 'stable';
}
