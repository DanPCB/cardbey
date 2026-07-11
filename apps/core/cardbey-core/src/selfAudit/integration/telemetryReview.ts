/**
 * Mission Console telemetry review (core-side port for self-audit bridge).
 */

export type TelemetryReviewStatus = 'healthy' | 'partial' | 'risk';

export interface TelemetryReviewInput {
  pipelineWrites: Array<{ source: string }>;
  intentPlans: Array<{ ok: boolean; inputHash: string; planHash?: string }>;
  resultConsistency: Array<{
    outputsJsonPresent?: boolean;
    mismatch?: boolean;
    executionSourceType?: string;
    hasJobId?: boolean;
  }>;
  executionEvents?: Array<{ execution_source?: string; execution_type?: string }>;
  pipelineOutputDualWrite?: boolean;
  environmentName?: string;
}

export interface TelemetryReview {
  status: TelemetryReviewStatus;
  summary: string;
  highlights: string[];
  risks: string[];
  suggestions: string[];
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

/**
 * Deterministic telemetry review for self-audit (no LLM).
 */
export function buildTelemetryReview(input: TelemetryReviewInput): TelemetryReview {
  const writes = input.pipelineWrites ?? [];
  const plans = input.intentPlans ?? [];
  const results = input.resultConsistency ?? [];
  const exec = input.executionEvents ?? [];

  const totalWrites = writes.length;
  const mismatchCount = results.filter((r) => r.mismatch).length;
  const outputsMissing = results.filter((r) => !r.outputsJsonPresent).length;
  const outputsPresentPct = pct(results.length - outputsMissing, results.length);
  const plannerFailed = plans.filter((p) => !p.ok).length;
  const allEmpty = totalWrites === 0 && plans.length === 0 && results.length === 0 && exec.length === 0;

  const highlights: string[] = [];
  const risks: string[] = [];
  const suggestions: string[] = [];

  if (totalWrites > 0) highlights.push(`${totalWrites} pipeline writes recorded`);
  if (plans.length > 0) highlights.push(`${plans.length} planner shadow events`);
  if (outputsPresentPct >= 80) highlights.push(`${outputsPresentPct}% outputsJson present`);

  if (allEmpty) {
    risks.push('All telemetry buffers empty — stream may be missing');
    suggestions.push('Verify MISSION_CONSOLE_TELEMETRY_STORE is enabled');
  }
  if (totalWrites > 0 && plans.length === 0) {
    risks.push('Pipeline writes without planner shadow events');
    suggestions.push('Check intent classifier → planner shadow path');
  }
  if (input.pipelineOutputDualWrite && mismatchCount > 0) {
    risks.push(`${mismatchCount} orchestra dual-write mirror gaps`);
    suggestions.push('Inspect pipelineCanonicalResults dual-write gating');
  }
  if (outputsPresentPct < 50 && results.length > 0) {
    risks.push(`Only ${outputsPresentPct}% of samples have outputsJson`);
    suggestions.push('Review performer result shape normalization');
  }
  if (plannerFailed > 0) {
    risks.push(`${plannerFailed} planner shadow failures`);
  }

  let status: TelemetryReviewStatus = 'healthy';
  if (risks.length >= 3 || mismatchCount > 5) status = 'risk';
  else if (risks.length > 0) status = 'partial';

  return {
    status,
    summary: allEmpty
      ? 'Telemetry buffers empty'
      : `${status} — ${risks.length} risk(s), ${highlights.length} highlight(s)`,
    highlights,
    risks,
    suggestions,
  };
}

export type TelemetryIssueCategory =
  | 'orchestra_mirror_gap'
  | 'planner_missing_context'
  | 'performer_result_shape'
  | 'telemetry_stream_missing'
  | 'admin_tool_discovery';

export interface TelemetryFixIssue {
  id: string;
  category: TelemetryIssueCategory;
  title: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  confidence: number;
  suggestedTool: 'code_fix';
  summary: string;
  evidence: string[];
  playbookId: string;
}

const HIGH_CONFIDENCE = 0.85;

/**
 * Derive fix opportunities from telemetry buffers + review.
 */
export function deriveTelemetryFixIssues(
  input: TelemetryReviewInput & { review: TelemetryReview },
): TelemetryFixIssue[] {
  const writes = input.pipelineWrites ?? [];
  const plans = input.intentPlans ?? [];
  const results = input.resultConsistency ?? [];
  const exec = input.executionEvents ?? [];
  const dual = Boolean(input.pipelineOutputDualWrite);
  const review = input.review;

  const totalWrites = writes.length;
  const resultsTotal = results.length;
  const mismatchCount = results.filter((r) => r.mismatch).length;
  const outputsMissing = results.filter((r) => !r.outputsJsonPresent).length;
  const outputsPresentPct = pct(resultsTotal - outputsMissing, resultsTotal);

  const allEmpty =
    totalWrites === 0 && plans.length === 0 && results.length === 0 && exec.length === 0;
  const writesInactiveButOther =
    totalWrites === 0 && (results.length > 0 || plans.length > 0 || exec.length > 0);
  const plannerMissing = totalWrites > 0 && plans.length === 0;

  const issues: TelemetryFixIssue[] = [];

  if (dual && mismatchCount > 0) {
    issues.push({
      id: `orchestra_mirror_gap:${mismatchCount}`,
      category: 'orchestra_mirror_gap',
      title: 'Orchestra dual-write mirror incomplete',
      severity: 'high',
      confidence: 0.9,
      suggestedTool: 'code_fix',
      summary: `${mismatchCount} pipeline rows missing orchestra_store_build mirror`,
      evidence: review.risks.filter((r) => r.includes('mirror')),
      playbookId: 'orchestra_mirror_gap',
    });
  }

  if (allEmpty || writesInactiveButOther) {
    issues.push({
      id: `telemetry_stream_missing:${Date.now()}`,
      category: 'telemetry_stream_missing',
      title: 'Telemetry stream missing or inactive',
      severity: allEmpty ? 'high' : 'medium',
      confidence: 0.88,
      suggestedTool: 'code_fix',
      summary: allEmpty
        ? 'All Mission Console telemetry buffers are empty'
        : 'Pipeline writes inactive while other telemetry present',
      evidence: review.risks,
      playbookId: 'telemetry_stream_missing',
    });
  }

  if (plannerMissing) {
    issues.push({
      id: `planner_missing_context:${totalWrites}`,
      category: 'planner_missing_context',
      title: 'Planner shadow missing for pipeline writes',
      severity: 'high',
      confidence: 0.87,
      suggestedTool: 'code_fix',
      summary: `${totalWrites} writes without planner shadow events`,
      evidence: review.risks.filter((r) => r.includes('planner')),
      playbookId: 'planner_missing_context',
    });
  }

  if (outputsPresentPct < 50 && resultsTotal > 0) {
    issues.push({
      id: `performer_result_shape:${outputsPresentPct}`,
      category: 'performer_result_shape',
      title: 'Performer result shape incomplete',
      severity: 'medium',
      confidence: 0.86,
      suggestedTool: 'code_fix',
      summary: `Only ${outputsPresentPct}% of samples have outputsJson`,
      evidence: review.risks.filter((r) => r.includes('outputsJson')),
      playbookId: 'performer_result_shape',
    });
  }

  return issues.filter((i) => i.confidence >= HIGH_CONFIDENCE && i.suggestedTool === 'code_fix');
}
