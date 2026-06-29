/**
 * Central feature flags — opt-out defaults for performer intelligence.
 * Set env var to "false" to disable; unset means enabled.
 */

function envOptOut(name) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  return raw !== 'false' && raw !== '0';
}

export const FEATURE_FLAGS = {
  get ENABLE_LLM_REASONER() {
    return envOptOut('ENABLE_LLM_REASONER');
  },
  get USE_REACT_REFLECTION() {
    return envOptOut('USE_REACT_REFLECTION');
  },
  get MEMORY_LOAD_TIMEOUT_MS() {
    const n = parseInt(process.env.MEMORY_LOAD_TIMEOUT_MS || '2000', 10);
    return Number.isFinite(n) && n > 0 ? n : 2000;
  },
  get USE_BACKEND_DISPATCH() {
    return envOptOut('USE_BACKEND_DISPATCH');
  },
};

/**
 * @returns {Record<string, boolean | number>}
 */
export function getFeatureFlagsSnapshot() {
  return {
    ENABLE_LLM_REASONER: FEATURE_FLAGS.ENABLE_LLM_REASONER,
    USE_REACT_REFLECTION: FEATURE_FLAGS.USE_REACT_REFLECTION,
    MEMORY_LOAD_TIMEOUT_MS: FEATURE_FLAGS.MEMORY_LOAD_TIMEOUT_MS,
    USE_BACKEND_DISPATCH: FEATURE_FLAGS.USE_BACKEND_DISPATCH,
  };
}
