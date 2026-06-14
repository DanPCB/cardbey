/**
 * Structured INTAKE_V2 telemetry (JSON line + optional DB persistence).
 */
import { getPrismaClient } from '../prisma.js';

function buildTelemetryLine(payload) {
  return {
    tag: 'INTAKE_V2',
    ts: new Date().toISOString(),
    traceId: typeof payload.traceId === 'string' && payload.traceId.trim() ? payload.traceId.trim() : null,
    message: typeof payload.message === 'string' ? payload.message.slice(0, 200) : '',
    missionId: payload.missionId ?? null,
    storeId: payload.storeId ?? null,
    executionPath: payload.executionPath ?? null,
    tool: payload.tool ?? null,
    confidence: payload.confidence ?? null,
    validated: payload.validated ?? null,
    downgraded: Boolean(payload.downgraded),
    downgradeReason: payload.downgradeReason ?? null,
    validationErrors: Array.isArray(payload.validationErrors) ? payload.validationErrors : [],
    riskLevel: payload.riskLevel ?? null,
    result: payload.result ?? null,
    latencyMs: payload.latencyMs ?? null,
    destinationTool: payload.destinationTool ?? null,
    llmPlanLength: payload.llmPlanLength ?? null,
    normalizedPlanLength: payload.normalizedPlanLength ?? null,
    injectedTools: payload.injectedTools ?? null,
    droppedTools: payload.droppedTools ?? null,
    shadow: payload.shadow ?? false,
    shadowMismatch: payload.shadowMismatch ?? null,
    intentFamily: payload.intentFamily ?? null,
    intentSubtype: payload.intentSubtype ?? null,
    candidateTools: Array.isArray(payload.candidateTools) ? payload.candidateTools : [],
    resolverRecovered: Boolean(payload.resolverRecovered),
    extractorsUsed: Array.isArray(payload.extractorsUsed) ? payload.extractorsUsed : [],
    missingContext: Array.isArray(payload.missingContext) ? payload.missingContext : [],
    persistedIntentUsed: Boolean(payload.persistedIntentUsed),
    persistedIntentFamily: payload.persistedIntentFamily ?? null,
    persistedIntentSubtype: payload.persistedIntentSubtype ?? null,
    persistedIntentOverridden: Boolean(payload.persistedIntentOverridden),
    capabilityGapDetected: Boolean(payload.capabilityGapDetected),
    requestedCapability:
      typeof payload.requestedCapability === 'string' ? payload.requestedCapability.slice(0, 200) : null,
    proposalSpawned: Boolean(payload.proposalSpawned),
    proposalType: payload.proposalType ?? null,
    resolvedFamily: payload.resolvedFamily ?? null,
    resolvedSubtype: payload.resolvedSubtype ?? null,
    heroAutoGenerateTriggered: Boolean(payload.heroAutoGenerateTriggered),
    heroGenerationReady: Boolean(payload.heroGenerationReady),
    heroGeneratedPrompt:
      typeof payload.heroGeneratedPrompt === 'string' ? payload.heroGeneratedPrompt.slice(0, 500) : null,
    heroAutoGenerateSource: payload.heroAutoGenerateSource ?? null,
  };
}

function resolveIntentLabel(payload) {
  if (typeof payload.intent === 'string' && payload.intent.trim()) {
    return payload.intent.trim().slice(0, 200);
  }
  const family = payload.intentFamily ?? payload.resolvedFamily;
  const subtype = payload.intentSubtype ?? payload.resolvedSubtype;
  if (family && subtype) return `${family}:${subtype}`.slice(0, 200);
  if (family) return String(family).slice(0, 200);
  if (typeof payload.tool === 'string' && payload.tool.trim()) return payload.tool.trim().slice(0, 200);
  return 'unknown';
}

function resolveQuery(payload) {
  if (typeof payload.query === 'string' && payload.query.trim()) {
    return payload.query.trim().slice(0, 2000);
  }
  if (typeof payload.message === 'string' && payload.message.trim()) {
    return payload.message.trim().slice(0, 2000);
  }
  return '';
}

let dispatchLogPersistWarned = false;

async function persistSkillDispatchLog(payload) {
  try {
    const prisma = getPrismaClient();
    if (!prisma?.skillDispatchLog?.create) return null;

    const traceId =
      typeof payload.traceId === 'string' && payload.traceId.trim()
        ? payload.traceId.trim().slice(0, 128)
        : `trace_${Date.now()}`;
    const query = resolveQuery(payload);
    if (!query) return null;

    const confidenceRaw = payload.confidence;
    const confidence =
      typeof confidenceRaw === 'number' && Number.isFinite(confidenceRaw)
        ? Math.max(0, Math.min(1, confidenceRaw))
        : 0;

    const row = await prisma.skillDispatchLog.create({
      data: {
        traceId,
        userId: payload.userId ? String(payload.userId).slice(0, 128) : null,
        sessionId: payload.sessionId ? String(payload.sessionId).slice(0, 128) : null,
        query,
        intent: resolveIntentLabel(payload),
        matchedSkill:
          typeof payload.tool === 'string' && payload.tool.trim()
            ? payload.tool.trim().slice(0, 120)
            : null,
        confidence,
        executionPath:
          typeof payload.executionPath === 'string' && payload.executionPath.trim()
            ? payload.executionPath.trim().slice(0, 64)
            : null,
        outcome:
          typeof payload.outcome === 'string' && payload.outcome.trim()
            ? payload.outcome.trim().slice(0, 32)
            : typeof payload.result === 'string' && payload.result.trim()
              ? payload.result.trim().slice(0, 32)
              : null,
        latencyMs:
          typeof payload.latencyMs === 'number' && Number.isFinite(payload.latencyMs)
            ? Math.round(payload.latencyMs)
            : null,
      },
    });
    return row.id;
  } catch (error) {
    if (!dispatchLogPersistWarned) {
      dispatchLogPersistWarned = true;
      const msg = error?.message ?? String(error);
      const hint = /column.*query.*does not exist/i.test(msg)
        ? ' Run: node scripts/ensure-skill-dispatch-log-columns.mjs'
        : '';
      console.warn(
        `[IntakeTelemetry] Failed to persist dispatch log (subsequent failures suppressed): ${msg}${hint}`,
      );
    }
    return null;
  }
}

/**
 * Log INTAKE_V2 telemetry to stdout and persist dispatch metadata when possible.
 * @returns {Promise<string|null>} dispatch log id when persisted
 */
export async function emitIntakeV2Telemetry(payload) {
  const line = buildTelemetryLine(payload);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
  return persistSkillDispatchLog(payload);
}

/** Fire-and-forget variant — does not block callers. */
export function emitIntakeV2TelemetryAsync(payload) {
  void emitIntakeV2Telemetry(payload).catch(() => {});
}
