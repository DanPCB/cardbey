/**
 * Single source of truth for intake feature flags.
 * All runtime code must read flags from here — no direct process.env.INTAKE_* elsewhere.
 */

function parseBoolEnv(raw, defaultValue) {
  const normalized = String(raw ?? '').trim().toLowerCase();
  if (normalized === 'false' || normalized === '0' || normalized === 'off') return false;
  if (normalized === 'true' || normalized === '1' || normalized === 'on') return true;
  return defaultValue;
}

function parseThreshold(raw, fallback) {
  const value = parseFloat(raw);
  return Number.isFinite(value) ? value : fallback;
}

/** @deprecated Decision loop removed — IntentReasoner is the sole classifier. Always false. */
function readDecisionLoopEnabled() {
  return false;
}

function readBeliefShadowEnabled() {
  return parseBoolEnv(process.env.INTAKE_BELIEF_SHADOW_ENABLED, true);
}

function readAdvisorShadowEnabled() {
  const raw = String(process.env.INTAKE_ADVISOR_SHADOW_ENABLED ?? '').trim().toLowerCase();
  if (raw === 'false' || raw === '0' || raw === 'off') return false;
  if (raw === 'true' || raw === '1' || raw === 'on') return true;
  return readBeliefShadowEnabled();
}

export const Features = {
  decisionLoop: {
    get enabled() {
      return readDecisionLoopEnabled();
    },
    get shadow() {
      return readBeliefShadowEnabled();
    },
    get log() {
      return parseBoolEnv(process.env.INTAKE_DECISION_LOOP_LOG, false);
    },
    thresholds: {
      get low() {
        return parseThreshold(process.env.INTAKE_DECISION_T_LOW, 0.55);
      },
      get margin() {
        return parseThreshold(process.env.INTAKE_DECISION_T_MARGIN, 0.15);
      },
    },
  },
  belief: {
    get shadow() {
      return readBeliefShadowEnabled();
    },
    get shadowLog() {
      return parseBoolEnv(process.env.INTAKE_BELIEF_SHADOW_LOG, false);
    },
  },
  advisor: {
    get shadow() {
      return readAdvisorShadowEnabled();
    },
    get shadowLog() {
      return parseBoolEnv(process.env.INTAKE_ADVISOR_SHADOW_LOG, false);
    },
  },
  bypasses: {
    get telemetryLog() {
      return parseBoolEnv(process.env.INTAKE_BYPASS_TELEMETRY_LOG, false);
    },
  },
  compiler: {
    get useForCampaigns() {
      return parseBoolEnv(process.env.USE_COMPILER_FOR_CAMPAIGNS, false);
    },
    get useForStores() {
      return parseBoolEnv(process.env.USE_COMPILER_FOR_STORES, false);
    },
  },
  loyalty: {
    /** When true: loyalty card scan uses IntentReasoner → compile → writeMetadata. Default false keeps ui-action. */
    get useSpine() {
      return parseBoolEnv(process.env.USE_LOYALTY_SPINE, false);
    },
  },
};

/** Snapshot for health checks and startup logs (plain values, not getters). */
/** @deprecated Always false — decision loop authority removed (Phase 1 collapse). */
export function isDecisionLoopEnabled() {
  return false;
}

export function snapshotFeatures() {
  return {
    decisionLoop: {
      enabled: Features.decisionLoop.enabled,
      shadow: Features.decisionLoop.shadow,
      log: Features.decisionLoop.log,
      thresholds: {
        low: Features.decisionLoop.thresholds.low,
        margin: Features.decisionLoop.thresholds.margin,
      },
    },
    belief: {
      shadow: Features.belief.shadow,
      shadowLog: Features.belief.shadowLog,
    },
    advisor: {
      shadow: Features.advisor.shadow,
      shadowLog: Features.advisor.shadowLog,
    },
    bypasses: {
      telemetryLog: Features.bypasses.telemetryLog,
    },
    compiler: {
      useForCampaigns: Features.compiler.useForCampaigns,
      useForStores: Features.compiler.useForStores,
    },
    loyalty: {
      useSpine: Features.loyalty.useSpine,
    },
  };
}

export default Features;
