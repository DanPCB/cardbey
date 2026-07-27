/** Shared provenance metadata for Honest Dashboard / Control Tower APIs. */

export const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/** @typedef {'high'|'medium'|'low'} TrustLevel */

/**
 * @param {object} fields
 * @param {string} fields.source
 * @param {TrustLevel} fields.trustLevel
 * @param {string} [fields.timestamp]
 * @param {number} [fields.staleThresholdMs]
 */
export function buildProvenance({
  source,
  trustLevel,
  timestamp,
  staleThresholdMs = STALE_THRESHOLD_MS,
  ...extra
}) {
  return {
    source,
    trust_level: trustLevel,
    timestamp: timestamp ?? new Date().toISOString(),
    stale_threshold_ms: staleThresholdMs,
    ...extra,
  };
}

/**
 * @param {{ timestamp?: string, stale_threshold_ms?: number }|null|undefined} provenance
 * @param {number} [nowMs]
 */
export function provenanceExecutedAt(provenance) {
  return provenance?.executed_at ?? provenance?.timestamp ?? null;
}

export function isProvenanceStale(provenance, nowMs = Date.now()) {
  const executedAt = provenanceExecutedAt(provenance);
  if (!executedAt) return true;
  const threshold = provenance.stale_threshold_ms ?? STALE_THRESHOLD_MS;
  const age = nowMs - new Date(executedAt).getTime();
  return !Number.isFinite(age) || age > threshold;
}

export const TRUTH_ENFORCER_VERSION = '1.0.0';

/**
 * @param {string} scannedAt ISO timestamp of the audit run
 */
export function buildTruthScoreProvenance(scannedAt) {
  return {
    source: 'local_audit',
    command: 'node scripts/truth-enforcer/index.mjs --audit',
    version: TRUTH_ENFORCER_VERSION,
    executed_at: scannedAt,
    trust_level: 'high',
    stale_threshold_ms: STALE_THRESHOLD_MS,
  };
}

/** @deprecated Use buildTruthScoreProvenance */
export function buildTruthAuditProvenance(_repoRoot, scannedAt) {
  return buildTruthScoreProvenance(scannedAt);
}

/**
 * @param {string} executedAt
 * @param {string} sinceIso
 */
export function buildOverviewDbProvenance(executedAt, sinceIso) {
  const windowLabel = `createdAt >= ${sinceIso}`;
  return {
    mission_runs: buildProvenance({
      source: 'database',
      trustLevel: 'medium',
      timestamp: executedAt,
      query: `prisma.missionRun.count({ where: { createdAt: { gte: '${sinceIso}' } } })`,
      table: 'MissionRun',
      window_days: 30,
    }),
    new_users: buildProvenance({
      source: 'database',
      trustLevel: 'medium',
      timestamp: executedAt,
      query: `prisma.user.count({ where: { createdAt: { gte: '${sinceIso}' } } })`,
      table: 'User',
      window_days: 30,
    }),
    mission_success_rate: buildProvenance({
      source: 'database',
      trustLevel: 'medium',
      timestamp: executedAt,
      query: `MissionRun completed vs failed counts (${windowLabel})`,
      table: 'MissionRun',
      derived: true,
    }),
    tenant_insights: buildProvenance({
      source: 'database',
      trustLevel: 'medium',
      timestamp: executedAt,
      query: `prisma.tenantInsight.findMany({ where: { createdAt: { gte: '${sinceIso}' } } })`,
      table: 'TenantInsight',
    }),
    workflow_smoke: buildProvenance({
      source: 'database',
      trustLevel: 'medium',
      timestamp: executedAt,
      query: `prisma.workflowRun (workflowKey=store_creation, ${windowLabel})`,
      table: 'WorkflowRun',
    }),
  };
}

/**
 * @param {import('./controlTowerGithubCi.js').GithubCiSummary|null|undefined} ci
 */
export function buildGithubCiProvenance(ci) {
  const fetchedAt = ci?.fetchedAt ?? new Date().toISOString();
  return buildProvenance({
    source: 'github_api',
    trustLevel: 'medium',
    timestamp: fetchedAt,
    endpoint: ci?.repo ? `repos/${ci.repo}/actions/workflows` : 'unconfigured',
    branch: ci?.branch ?? 'main',
    availability: ci?.availability ?? 'unavailable',
  });
}

/**
 * @param {string} [timestamp]
 */
export function buildEnvFlagsProvenance(timestamp) {
  return buildProvenance({
    source: 'environment_variables',
    trustLevel: 'high',
    timestamp,
    keys: ['FF_CAMPAIGN_V2', 'FF_CAPABILITY_PROPOSAL', 'FF_PROMOTION_FLOW'],
    description: 'Direct process.env read — no remote flag service',
  });
}

/**
 * @param {string} [timestamp]
 */
export function buildOperatorInputProvenance(timestamp) {
  return buildProvenance({
    source: 'manual_operator_input',
    trustLevel: 'low',
    timestamp,
    description: 'Weekly focus, timeline, and static action queue copy',
  });
}
