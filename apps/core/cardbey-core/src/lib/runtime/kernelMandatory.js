/**
 * Runtime Kernel mandatory mode — single execution authority.
 * Authority booleans delegate to executionMode.js (Phase 9).
 */

import { isEmergencyBypassEnabled } from './emergencyBypass.js';
import { normalizeCampaignClassificationForKernel } from '../intake/campaignKernelRouting.js';
import { diagLog, isKernelDispatchDiagEnabled } from '../diagnostics/storeCreationDiagnostics.js';
import {
  isKernelMandatoryEnabled,
  isRuntimeStepExecutionEnabled,
  isPerformerRuntimeKernelEnabled,
  isSharedRuntimeToolRegistryEnabled,
} from './executionMode.js';

/** Tools that must stay on direct_action under kernel mandatory (sync read → user choice). */
const KERNEL_PRESERVE_DIRECT_ACTION_TOOLS = new Set(['ingest_asset_for_intent_detection']);

export {
  isKernelMandatoryEnabled,
  isRuntimeStepExecutionEnabled,
  isPerformerRuntimeKernelEnabled,
  isSharedRuntimeToolRegistryEnabled,
};

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
  'intake_v2_manual_mode',
  'intake_v2_confirm',
  'intake_v2_shortcut_contract',
  'intake_v2_classified_checkpoint',
  'intake_v2_classified_campaign_checkpoint',
  'intake_v2_confirm_intercept_campaign',
  'intake_v2_fresh_store_draft',
  'mission_execution_engine',
  'mission_checkpoint_respond',
  'run_mission_until_blocked',
  'skill_router',
  'orchestra_start',
  'factory_runtime_api',
  'performer_runtime',
  'intent_hybrid_router',
  'agent_orchestration',
]);

/**
 * Runtime sources that invoke executeRuntimeAction as the authorized kernel facade
 * (not legacy Performer direct_action bypass). Broker direct-action block applies outside this set.
 *
 * @param {string} [source]
 * @param {string} [actionType]
 * @returns {boolean}
 */
export function isKernelAuthorizedRuntimeSource(source = '', actionType = '') {
  const src = typeof source === 'string' ? source.trim() : '';
  const at = typeof actionType === 'string' ? actionType.trim() : '';
  if (at === 'execute_action' || at === 'assist_hybrid_operation' || at === 'run_pipeline_step') {
    return true;
  }
  if (!src) return false;
  if (KERNEL_AUTHORIZED_RUNTIME_SOURCES.has(src)) return true;
  if (src.startsWith('ui_') || src === 'ui_runtime' || src === 'ui_runtime_action') return true;
  return false;
}

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

  if (actionType === 'execute_action' || actionType === 'assist_hybrid_operation') {
    return { ok: true };
  }

  if (KERNEL_AUTHORIZED_RUNTIME_SOURCES.has(source)) {
    return { ok: true };
  }
  if (source.startsWith('ui_') || source === 'ui_runtime' || source === 'ui_runtime_action') {
    return { ok: true };
  }

  const diag = isKernelDispatchDiagEnabled();
  diagLog(diag, '===== Kernel Guard (assertKernelAuthorizedExecution) =====');
  diagLog(diag, '❌ BLOCKED source:', source, 'actionType:', actionType || '(none)');
  diagLog(diag, 'KERNEL_AUTHORIZED_RUNTIME_SOURCES has source?', KERNEL_AUTHORIZED_RUNTIME_SOURCES.has(source));
  diagLog(diag, 'EMERGENCY_BYPASS_KERNEL:', process.env.EMERGENCY_BYPASS_KERNEL);
  diagLog(diag, 'BYPASS_KERNEL_FOR_CREATE_STORE:', process.env.BYPASS_KERNEL_FOR_CREATE_STORE);

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

  const campaignNormalized = normalizeCampaignClassificationForKernel(classification);
  if (campaignNormalized !== classification) return campaignNormalized;

  const tool = String(classification.tool ?? '').trim();
  if (KERNEL_PRESERVE_DIRECT_ACTION_TOOLS.has(tool)) {
    return classification;
  }

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
