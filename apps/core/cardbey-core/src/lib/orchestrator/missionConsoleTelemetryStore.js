/**
 * In-memory ring buffers for Mission Console telemetry dashboard.
 * Bounded size; no PII beyond mission ids / hashes already emitted by audit paths.
 * Disable with MISSION_CONSOLE_TELEMETRY_STORE=false.
 */

const MAX_PIPELINE = 500;
const MAX_INTENT = 500;
const MAX_EXECUTION_DISPATCH = 500;

/** @type {object[]} */
const pipelineWrites = [];
/** @type {object[]} */
const intentPlans = [];
/** @type {object[]} Wave 3.1 — optional performer execution dispatch rows (opt-in). */
const executionDispatches = [];

function storeEnabled() {
  return String(process.env.MISSION_CONSOLE_TELEMETRY_STORE || '').trim().toLowerCase() !== 'false';
}

/**
 * Opt-in: record structured execution_source / execution_type rows without changing pipeline write `source`.
 * Default **off** so API shape stays stable with empty `executionEvents` until explicitly enabled.
 */
export function performerExecutionTelemetryEnabled() {
  return String(process.env.PERFORMER_EXECUTION_TELEMETRY || '').trim().toLowerCase() === 'true';
}

function inferLegacySource(executionType) {
  const t = String(executionType || '').trim().toLowerCase();
  if (t === 'proactive_confirm') return 'performer_proactive_confirm';
  if (t === 'proactive_step') return 'performer_proactive_step';
  return t ? `performer_${t}` : 'performer_unknown';
}

function trimBuffer(arr, max) {
  while (arr.length > max) arr.shift();
}

/**
 * @param {{ source: string, correlationId?: string|null, missionId?: string|null, fields?: string[] }} entry
 */
export function recordPipelineWriteEvent(entry) {
  if (!storeEnabled()) return;
  const missionId =
    entry.missionId != null && typeof entry.missionId === 'string'
      ? entry.missionId
      : entry.missionId != null
        ? String(entry.missionId)
        : undefined;
  pipelineWrites.push({
    tag: 'PIPELINE_WRITE',
    source: entry.source,
    correlationId: entry.correlationId ?? undefined,
    missionId,
    fields: Array.isArray(entry.fields) ? entry.fields : [],
    timestamp: new Date().toISOString(),
  });
  trimBuffer(pipelineWrites, MAX_PIPELINE);
}

/**
 * @param {{
 *   source: string,
 *   inputHash: string,
 *   planHash: string,
 *   missionType?: string|null,
 *   correlationId?: string|null,
 *   ok: boolean,
 *   code?: string,
 * }} entry
 */
/**
 * @param {{
 *   source: string,
 *   executionType: string,
 *   missionId: string,
 *   action: string,
 *   context?: Record<string, unknown>,
 *   correlationId?: string|null,
 *   legacySource?: string,
 * }} entry
 */
export function recordExecutionDispatchEvent(entry) {
  if (!storeEnabled() || !performerExecutionTelemetryEnabled()) return;
  const missionId =
    entry.missionId != null && typeof entry.missionId === 'string'
      ? entry.missionId
      : String(entry.missionId ?? '');
  const legacy = entry.legacySource || inferLegacySource(entry.executionType);
  executionDispatches.push({
    tag: 'EXECUTION_DISPATCH',
    execution_source: entry.source,
    execution_type: entry.executionType,
    legacy_source: legacy,
    missionId: missionId || undefined,
    action: entry.action,
    correlationId: entry.correlationId ?? missionId ?? undefined,
    ...(entry.context && typeof entry.context === 'object' ? { context: entry.context } : {}),
    timestamp: new Date().toISOString(),
  });
  trimBuffer(executionDispatches, MAX_EXECUTION_DISPATCH);
}

export function recordIntentPlanEvent(entry) {
  if (!storeEnabled()) return;
  intentPlans.push({
    tag: 'INTENT_PLAN_SHADOW',
    source: entry.source,
    inputHash: entry.inputHash,
    planHash: entry.planHash,
    missionType: entry.missionType ?? undefined,
    correlationId: entry.correlationId ?? undefined,
    ok: entry.ok,
    code: entry.code ?? undefined,
    timestamp: new Date().toISOString(),
  });
  trimBuffer(intentPlans, MAX_INTENT);
}

export function getMissionConsoleTelemetryBuffers() {
  return {
    pipelineWrites: pipelineWrites.map((r) => ({ ...r })),
    intentPlans: intentPlans.map((r) => ({ ...r })),
    executionEvents: executionDispatches.map((r) => ({ ...r })),
  };
}
