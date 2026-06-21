/**
 * Runtime Kernel mandatory mode — single execution authority.
 * Default ON; opt-out via DISABLE_KERNEL_MANDATORY or EMERGENCY_BYPASS_KERNEL.
 */

import { isEmergencyBypassEnabled } from './emergencyBypass.js';

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

/** Kernel mandatory mode (blocks legacy bypass paths). */
export function isKernelMandatoryEnabled() {
  if (isEmergencyBypassEnabled()) return false;
  return !envTruthy('DISABLE_KERNEL_MANDATORY', false);
}

/** Runtime step execution via kernel — default ON unless explicitly disabled. */
export function isRuntimeStepExecutionEnabled() {
  if (isEmergencyBypassEnabled()) {
    return envTruthy('ENABLE_RUNTIME_STEP_EXECUTION', true);
  }
  return envDisabled('DISABLE_RUNTIME_STEP_EXECUTION', 'ENABLE_RUNTIME_STEP_EXECUTION', true);
}

/** Runtime kernel master switch — default ON unless explicitly disabled. */
export function isPerformerRuntimeKernelEnabled() {
  if (isEmergencyBypassEnabled()) {
    return envTruthy('ENABLE_PERFORMER_RUNTIME_KERNEL', false);
  }
  return envDisabled('DISABLE_RUNTIME_KERNEL', 'ENABLE_PERFORMER_RUNTIME_KERNEL', true);
}

/** Shared tool registry — default ON with kernel mandatory. */
export function isSharedRuntimeToolRegistryEnabled() {
  if (isEmergencyBypassEnabled()) {
    return envTruthy('ENABLE_SHARED_RUNTIME_TOOL_REGISTRY', false);
  }
  return envDisabled(
    'DISABLE_SHARED_RUNTIME_TOOL_REGISTRY',
    'ENABLE_SHARED_RUNTIME_TOOL_REGISTRY',
    true,
  );
}

/** Sources allowed to invoke executeRuntimeAction when kernel mandatory. */
export const KERNEL_AUTHORIZED_RUNTIME_SOURCES = new Set([
  'performer_runtime_kernel',
  'runtime_kernel',
  'runtime_mission_step',
  'executeMissionStep',
  'performer_proactive_step',
  'ui_runtime_action',
  'factory_runtime',
  'factory_intent_router',
  'intake_v2_factory_intent',
  'intake_v2_unified',
  'intake_v2_confirm',
  'run_mission_until_blocked',
  'skill_router',
  'orchestra_start',
  'factory_runtime_api',
  'performer_runtime',
  'intent_hybrid_router',
  'agent_orchestration',
]);

/**
 * @param {{ source?: string, actionType?: string, userId?: string|null }} input
 * @returns {{ ok: true, emergency?: boolean } | { ok: false, code: string, message: string }}
 */
export function assertKernelAuthorizedExecution(input = {}) {
  if (isEmergencyBypassEnabled()) {
    return { ok: true, emergency: true };
  }
  if (!isKernelMandatoryEnabled()) {
    return { ok: true };
  }

  const source = typeof input.source === 'string' ? input.source.trim() : '';
  const actionType = typeof input.actionType === 'string' ? input.actionType.trim() : '';

  // UI runtime gateway and hybrid assist envelopes are kernel-authorized by construction.
  if (actionType === 'execute_action' || actionType === 'assist_hybrid_operation') {
    return { ok: true };
  }

  if (KERNEL_AUTHORIZED_RUNTIME_SOURCES.has(source)) {
    return { ok: true };
  }
  if (source.startsWith('ui_') || source === 'ui_runtime' || source === 'ui_runtime_action') {
    return { ok: true };
  }

  return {
    ok: false,
    code: 'KERNEL_EXECUTION_REQUIRED',
    message: 'Execution must go through the Runtime Kernel. Direct tool dispatch is not allowed.',
  };
}

/**
 * Map legacy direct_action classifications to proactive_plan under kernel mandatory mode.
 * @param {object} classification
 * @returns {object}
 */
export function normalizeClassificationForKernel(classification) {
  if (!classification || typeof classification !== 'object') return classification;
  if (!isKernelMandatoryEnabled()) return classification;
  if (classification.executionPath !== 'direct_action') return classification;
  return {
    ...classification,
    executionPath: 'proactive_plan',
    tool: classification.tool ?? null,
    _kernelNormalizedFrom: 'direct_action',
  };
}

/** Intake pre-classifier shortcuts allowed only when kernel mandatory is off or emergency bypass. */
export function areIntakeShortcutsAllowed() {
  return !isKernelMandatoryEnabled() || isEmergencyBypassEnabled();
}
