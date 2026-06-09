/**
 * Path A + self-healing code_fix guardrails (proposal only; human approval required).
 */

export const PATH_A_CODE_FIX_GUARDRAILS = Object.freeze({
  proposalOnly: true,
  noFileWrites: true,
  noAutoApply: true,
  humanApprovalRequired: true,
});

export const ALLOWED_TELEMETRY_ISSUE_CATEGORIES = new Set([
  'orchestra_mirror_gap',
  'planner_missing_context',
  'performer_result_shape',
  'telemetry_stream_missing',
  'admin_tool_discovery',
]);

/**
 * @param {unknown} guardrails
 * @returns {boolean}
 */
export function validateCodeFixGuardrails(guardrails) {
  const g = guardrails;
  if (!g || typeof g !== 'object' || Array.isArray(g)) return false;
  return (
    g.proposalOnly === true &&
    g.noFileWrites === true &&
    g.noAutoApply === true &&
    g.humanApprovalRequired === true
  );
}

/**
 * @param {unknown} issue
 */
export function validateTelemetryIssueShape(issue) {
  if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return false;
  const i = /** @type {Record<string, unknown>} */ (issue);
  const cat = typeof i.category === 'string' ? i.category : '';
  if (!ALLOWED_TELEMETRY_ISSUE_CATEGORIES.has(cat)) return false;
  if (i.suggestedTool !== 'code_fix') return false;
  if (typeof i.title !== 'string' || !i.title.trim()) return false;
  if (typeof i.summary !== 'string' || !i.summary.trim()) return false;
  if (!Array.isArray(i.evidence)) return false;
  return true;
}

/**
 * @param {unknown} playbook
 * @param {string} category
 */
export function validatePlaybookShape(playbook, category) {
  if (!playbook || typeof playbook !== 'object' || Array.isArray(playbook)) return false;
  const pb = /** @type {Record<string, unknown>} */ (playbook);
  if (pb.category !== category) return false;
  if (!Array.isArray(pb.likelyFiles) || pb.likelyFiles.length === 0) return false;
  if (!Array.isArray(pb.constraints) || pb.constraints.length === 0) return false;
  if (!Array.isArray(pb.validationSteps) || pb.validationSteps.length === 0) return false;
  return true;
}

/**
 * @param {Record<string, unknown>} issue
 * @param {Record<string, unknown>} playbook
 * @param {Record<string, unknown>} telemetryContext
 */
export function buildTelemetryCodeFixDescription(issue, playbook, telemetryContext) {
  const evidence = Array.isArray(issue.evidence) ? issue.evidence : [];
  const likelyFiles = Array.isArray(playbook.likelyFiles) ? playbook.likelyFiles : [];
  const constraints = Array.isArray(playbook.constraints) ? playbook.constraints : [];
  const validationSteps = Array.isArray(playbook.validationSteps) ? playbook.validationSteps : [];

  const parts = [
    '[PATH_A_TELEMETRY_CODE_FIX] Proposal only. Human approval required before any edit. No API auto-apply and no file writes from this endpoint.',
    `Category: ${issue.category}`,
    `Title: ${issue.title}`,
    `Severity: ${typeof issue.severity === 'string' ? issue.severity : 'unknown'}`,
    `Telemetry heuristic confidence: ${typeof issue.confidence === 'number' ? issue.confidence : 'n/a'}`,
    `Summary: ${issue.summary}`,
    'Evidence:',
    ...evidence.map((e) => ` - ${String(e)}`),
    'Playbook — likely files:',
    ...likelyFiles.map((f) => ` - ${String(f)}`),
    'Playbook — constraints:',
    ...constraints.map((c) => ` - ${String(c)}`),
    'Playbook — validation steps (after manual patch):',
    ...validationSteps.map((v) => ` - ${String(v)}`),
    'Telemetry context (JSON):',
    JSON.stringify(telemetryContext, null, 2),
  ];
  return parts.join('\n');
}
