/**
 * Flatten intent resolver output for INTAKE_V2 log lines.
 */

/**
 * @param {import('./intakeIntentResolver.js').IntentResolutionResult | null | undefined} ir
 */
export function intentResolutionTelemetryFields(ir) {
  if (!ir) {
    return {
      intentFamily: null,
      intentSubtype: null,
      candidateTools: [],
      resolverRecovered: false,
      extractorsUsed: [],
      missingContext: [],
      persistedIntentUsed: false,
      persistedIntentFamily: null,
      persistedIntentSubtype: null,
      persistedIntentOverridden: false,
    };
  }
  return {
    intentFamily: ir.family ?? null,
    intentSubtype: ir.subtype ?? null,
    candidateTools: Array.isArray(ir.candidateTools) ? ir.candidateTools : [],
    resolverRecovered: Boolean(ir.recovered),
    extractorsUsed: Array.isArray(ir.extractorsUsed) ? ir.extractorsUsed : [],
    missingContext: Array.isArray(ir.missingContext) ? ir.missingContext : [],
    persistedIntentUsed: Boolean(ir.persistedIntentUsed),
    persistedIntentFamily: ir.persistedIntentFamily ?? null,
    persistedIntentSubtype: ir.persistedIntentSubtype ?? null,
    persistedIntentOverridden: Boolean(ir.persistedIntentOverridden),
  };
}
