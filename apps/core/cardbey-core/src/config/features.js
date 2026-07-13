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
  multiAgent: {
    /** When true: multi_agent / campaign_orchestration missions require explicit confirmation before AUTO_RUN. */
    get requireConfirmation() {
      return parseBoolEnv(process.env.MULTI_AGENT_REQUIRE_CONFIRMATION, true);
    },
    /** Internal user IDs allowed to bypass confirmation when skipConfirmation=true. */
    get skipConfirmationUsers() {
      const raw = String(process.env.MULTI_AGENT_SKIP_CONFIRMATION_USERS ?? '').trim();
      if (!raw) return [];
      return raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
    },
  },
  uaf: {
    get enabled() {
      const raw = String(process.env.ENABLE_UNIVERSAL_ARTIFACT_FACTORY ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off') return false;
      if (raw === 'true' || raw === '1' || raw === 'on') return true;
      return process.env.NODE_ENV !== 'production';
    },
  },
  typedCatalog: {
    get compilerEnabled() {
      const raw = String(process.env.ENABLE_TYPED_CATALOG_COMPILER ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off') return false;
      if (raw === 'true' || raw === '1' || raw === 'on') return true;
      return process.env.NODE_ENV !== 'production';
    },
    get semanticQaEnabled() {
      const raw = String(process.env.ENABLE_SEMANTIC_CATALOG_QA ?? '').trim().toLowerCase();
      if (raw === 'false' || raw === '0' || raw === 'off') return false;
      return true;
    },
  },
  intentEngine: {
    /** Phase 1: run intent-first engine alongside legacy pipeline (read-only compare). */
    get shadow() {
      return parseBoolEnv(process.env.INTENT_ENGINE_SHADOW, true);
    },
    /** Phase 2: route intake through intent-first engine as primary authority. */
    get primary() {
      return parseBoolEnv(process.env.INTENT_ENGINE_PRIMARY, false);
    },
    get shadowLog() {
      return parseBoolEnv(
        process.env.INTENT_ENGINE_SHADOW_LOG,
        process.env.NODE_ENV === 'development',
      );
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
    typedCatalog: {
      compilerEnabled: Features.typedCatalog.compilerEnabled,
      semanticQaEnabled: Features.typedCatalog.semanticQaEnabled,
    },
    loyalty: {
      useSpine: Features.loyalty.useSpine,
    },
    multiAgent: {
      requireConfirmation: Features.multiAgent.requireConfirmation,
      skipConfirmationUsers: Features.multiAgent.skipConfirmationUsers,
    },
    uaf: {
      enabled: Features.uaf.enabled,
    },
    intentEngine: {
      shadow: Features.intentEngine.shadow,
      primary: Features.intentEngine.primary,
      shadowLog: Features.intentEngine.shadowLog,
    },
  };
}

export default Features;
