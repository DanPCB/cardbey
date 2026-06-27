/**
 * Phase 9 — canonical execution authority mode.
 *
 * EXECUTION_MODE = kernel | hybrid | legacy
 * Default: kernel (production). Legacy env flags remain as backward-compat inputs
 * when EXECUTION_MODE is unset.
 */

/** @typedef {'kernel' | 'hybrid' | 'legacy'} ExecutionMode */

/**
 * @typedef {{
 *   mode: ExecutionMode;
 *   kernelMandatory: boolean;
 *   runtimeKernel: boolean;
 *   runtimeStepExecution: boolean;
 *   sharedRuntimeToolRegistry: boolean;
 *   brokerDirectViaFacade: boolean;
 *   brokerBlockDirectAction: boolean;
 *   performerRuntimeEnabled: boolean;
 *   performerRuntimePipelineFacade: boolean;
 *   source: 'EXECUTION_MODE' | 'legacy_env_compat';
 * }} ExecutionModeProfile
 */

/** @type {Record<ExecutionMode, Omit<ExecutionModeProfile, 'mode' | 'source'>>} */
const MODE_PRESETS = {
  kernel: {
    kernelMandatory: true,
    runtimeKernel: true,
    runtimeStepExecution: true,
    sharedRuntimeToolRegistry: true,
    brokerDirectViaFacade: true,
    brokerBlockDirectAction: true,
    performerRuntimeEnabled: true,
    performerRuntimePipelineFacade: true,
  },
  hybrid: {
    kernelMandatory: true,
    runtimeKernel: true,
    runtimeStepExecution: true,
    sharedRuntimeToolRegistry: true,
    brokerDirectViaFacade: true,
    brokerBlockDirectAction: false,
    performerRuntimeEnabled: true,
    performerRuntimePipelineFacade: true,
  },
  legacy: {
    kernelMandatory: false,
    runtimeKernel: false,
    runtimeStepExecution: true,
    sharedRuntimeToolRegistry: false,
    brokerDirectViaFacade: false,
    brokerBlockDirectAction: false,
    performerRuntimeEnabled: false,
    performerRuntimePipelineFacade: false,
  },
};

const DEPRECATED_AUTHORITY_FLAGS = [
  'DISABLE_KERNEL_MANDATORY',
  'DISABLE_RUNTIME_KERNEL',
  'ENABLE_PERFORMER_RUNTIME_KERNEL',
  'DISABLE_RUNTIME_STEP_EXECUTION',
  'ENABLE_RUNTIME_STEP_EXECUTION',
  'DISABLE_SHARED_RUNTIME_TOOL_REGISTRY',
  'ENABLE_SHARED_RUNTIME_TOOL_REGISTRY',
  'BROKER_DIRECT_VIA_FACADE',
  'BROKER_BLOCK_DIRECT_ACTION',
  'PERFORMER_RUNTIME_ENABLED',
  'PERFORMER_RUNTIME_PIPELINE_FACADE',
];

/** @type {ExecutionModeProfile | null} */
let cachedProfile = null;
let legacyModeDeprecationLogged = false;
let legacyFlagDeprecationLogged = false;

function envTruthy(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return defaultValue;
  }
  const v = String(raw).trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function envDisabled(disableEnv, enableEnv, defaultEnabled = true) {
  if (envTruthy(disableEnv, false)) return false;
  const raw = process.env[enableEnv];
  if (raw !== undefined && raw !== null && String(raw).trim() !== '') {
    return envTruthy(enableEnv, false);
  }
  return defaultEnabled;
}

function isEmergencyBypassEnabled() {
  return envTruthy('EMERGENCY_BYPASS_KERNEL');
}

/**
 * @param {string | undefined} raw
 * @returns {ExecutionMode | null}
 */
function parseExecutionMode(raw) {
  const v = String(raw ?? '').trim().toLowerCase();
  if (v === 'kernel' || v === 'hybrid' || v === 'legacy') return v;
  return null;
}

function resolveBrokerBlockDirectFromLegacy() {
  const raw = process.env.BROKER_BLOCK_DIRECT_ACTION;
  if (raw !== undefined && raw !== null && String(raw).trim().toLowerCase() === 'false') {
    return false;
  }
  return true;
}

/**
 * @returns {ExecutionMode}
 */
function inferModeFromLegacyFlags() {
  if (isEmergencyBypassEnabled() || envTruthy('DISABLE_KERNEL_MANDATORY', false)) {
    return 'legacy';
  }
  if (!resolveBrokerBlockDirectFromLegacy()) {
    return 'hybrid';
  }
  return 'kernel';
}

/**
 * @returns {ExecutionModeProfile}
 */
function resolveFromLegacyEnv() {
  const emergency = isEmergencyBypassEnabled();
  const mode = inferModeFromLegacyFlags();

  return {
    mode,
    kernelMandatory: emergency ? false : !envTruthy('DISABLE_KERNEL_MANDATORY', false),
    runtimeKernel: emergency
      ? envTruthy('ENABLE_PERFORMER_RUNTIME_KERNEL', false)
      : envDisabled('DISABLE_RUNTIME_KERNEL', 'ENABLE_PERFORMER_RUNTIME_KERNEL', true),
    runtimeStepExecution: emergency
      ? envTruthy('ENABLE_RUNTIME_STEP_EXECUTION', true)
      : envDisabled('DISABLE_RUNTIME_STEP_EXECUTION', 'ENABLE_RUNTIME_STEP_EXECUTION', true),
    sharedRuntimeToolRegistry: emergency
      ? envTruthy('ENABLE_SHARED_RUNTIME_TOOL_REGISTRY', false)
      : envDisabled(
          'DISABLE_SHARED_RUNTIME_TOOL_REGISTRY',
          'ENABLE_SHARED_RUNTIME_TOOL_REGISTRY',
          true,
        ),
    brokerDirectViaFacade: envTruthy('BROKER_DIRECT_VIA_FACADE', false),
    brokerBlockDirectAction: resolveBrokerBlockDirectFromLegacy(),
    performerRuntimeEnabled: envTruthy('PERFORMER_RUNTIME_ENABLED', false),
    performerRuntimePipelineFacade: envTruthy('PERFORMER_RUNTIME_PIPELINE_FACADE', true),
    source: 'legacy_env_compat',
  };
}

/**
 * @param {ExecutionMode} mode
 * @returns {ExecutionModeProfile}
 */
function resolveFromExecutionMode(mode) {
  const preset = MODE_PRESETS[mode];
  const emergency = isEmergencyBypassEnabled();

  return {
    mode,
    kernelMandatory: emergency ? false : preset.kernelMandatory,
    runtimeKernel: emergency ? envTruthy('ENABLE_PERFORMER_RUNTIME_KERNEL', false) : preset.runtimeKernel,
    runtimeStepExecution: emergency
      ? envTruthy('ENABLE_RUNTIME_STEP_EXECUTION', true)
      : preset.runtimeStepExecution,
    sharedRuntimeToolRegistry: emergency
      ? envTruthy('ENABLE_SHARED_RUNTIME_TOOL_REGISTRY', false)
      : preset.sharedRuntimeToolRegistry,
    brokerDirectViaFacade: preset.brokerDirectViaFacade,
    brokerBlockDirectAction: preset.brokerBlockDirectAction,
    performerRuntimeEnabled: preset.performerRuntimeEnabled,
    performerRuntimePipelineFacade: preset.performerRuntimePipelineFacade,
    source: 'EXECUTION_MODE',
  };
}

function listActiveDeprecatedAuthorityFlags() {
  return DEPRECATED_AUTHORITY_FLAGS.filter((name) => {
    const raw = process.env[name];
    return raw !== undefined && raw !== null && String(raw).trim() !== '';
  });
}

function maybeLogLegacyFlagDeprecation(explicitMode) {
  if (legacyFlagDeprecationLogged) return;
  const active = listActiveDeprecatedAuthorityFlags();
  if (active.length === 0) return;
  legacyFlagDeprecationLogged = true;
  console.warn('[execution-mode] deprecated authority flags are set but ignored when EXECUTION_MODE is explicit', {
    EXECUTION_MODE: explicitMode,
    deprecatedFlags: active,
    hint: 'Remove legacy flags and use EXECUTION_MODE=kernel|hybrid|legacy',
  });
}

function maybeSuggestExecutionMode(inferredMode) {
  if (legacyFlagDeprecationLogged) return;
  const active = listActiveDeprecatedAuthorityFlags();
  if (active.length === 0) return;
  legacyFlagDeprecationLogged = true;
  console.warn('[execution-mode] legacy authority flags detected; prefer EXECUTION_MODE', {
    inferredMode,
    deprecatedFlags: active,
    hint: `Set EXECUTION_MODE=${inferredMode}`,
  });
}

function maybeLogLegacyModeDeprecation(mode) {
  if (mode !== 'legacy' || legacyModeDeprecationLogged) return;
  legacyModeDeprecationLogged = true;
  console.warn('[execution-mode] legacy mode active; direct bypass paths may be used', {
    mode: 'legacy',
    hint: 'Set EXECUTION_MODE=kernel for production',
  });
}

/** Test helper — reset boot cache. */
export function resetExecutionModeForTests() {
  cachedProfile = null;
  legacyModeDeprecationLogged = false;
  legacyFlagDeprecationLogged = false;
}

/**
 * @returns {ExecutionModeProfile}
 */
export function getExecutionModeProfile() {
  if (cachedProfile) return cachedProfile;

  const explicit = parseExecutionMode(process.env.EXECUTION_MODE);
  const profile = explicit ? resolveFromExecutionMode(explicit) : resolveFromLegacyEnv();

  if (explicit) {
    maybeLogLegacyFlagDeprecation(explicit);
  } else {
    maybeSuggestExecutionMode(profile.mode);
  }
  maybeLogLegacyModeDeprecation(profile.mode);

  cachedProfile = profile;
  return profile;
}

/** @returns {ExecutionMode} */
export function getExecutionMode() {
  return getExecutionModeProfile().mode;
}

export function isKernelMandatoryEnabled() {
  return getExecutionModeProfile().kernelMandatory;
}

export function isRuntimeStepExecutionEnabled() {
  return getExecutionModeProfile().runtimeStepExecution;
}

export function isPerformerRuntimeKernelEnabled() {
  return getExecutionModeProfile().runtimeKernel;
}

export function isSharedRuntimeToolRegistryEnabled() {
  return getExecutionModeProfile().sharedRuntimeToolRegistry;
}

export function isBrokerDirectViaFacadeEnabled() {
  return getExecutionModeProfile().brokerDirectViaFacade;
}

export function isBrokerBlockDirectActionEnabled() {
  return getExecutionModeProfile().brokerBlockDirectAction;
}

export function isPerformerRuntimeEnabled() {
  return getExecutionModeProfile().performerRuntimeEnabled;
}

export function isPerformerRuntimePipelineFacadeEnabled() {
  return getExecutionModeProfile().performerRuntimePipelineFacade;
}

export { isEmergencyBypassEnabled };
