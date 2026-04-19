/**
 * Structured INTAKE_V2 telemetry (JSON line).
 */

export function emitIntakeV2Telemetry(payload) {
  const line = {
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
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(line));
}
