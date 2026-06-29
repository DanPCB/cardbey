/**
 * Single source of truth for intake / decision-loop feature flags.
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

/** @type {boolean | null} */
let decisionLoopAuthorityLogged = null;

function readDecisionLoopEnabled() {
  const enabled = parseBoolEnv(process.env.INTAKE_DECISION_LOOP_AUTHORITY, false);
  if (process.env.NODE_ENV !== 'test' && decisionLoopAuthorityLogged !== enabled) {
    decisionLoopAuthorityLogged = enabled;
    console.log('[intake/decision-loop] INTAKE_DECISION_LOOP_AUTHORITY=', enabled ? 'on' : 'off');
  }
  return enabled;
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
};

/** Snapshot for health checks and startup logs (plain values, not getters). */
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
  };
}

export default Features;
