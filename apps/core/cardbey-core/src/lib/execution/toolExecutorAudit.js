/**
 * Phase 7 — programmatic tool executor audit.
 * Single source for kernel routing coverage reports and regression tests.
 */

import { listRegisteredExecutorTools } from '../toolExecutors/index.js';
import {
  KERNEL_CHECKPOINT_TOOLS,
  KERNEL_ONLY_INTAKE_TOOLS,
  isKernelOnlyIntakeTool,
} from '../intake/intakeShortcutPolicy.js';

/** Tools with dedicated checkpoint kernel wrappers in kernelPipelineDispatch.js */
export const DEDICATED_KERNEL_WRAPPER_TOOLS = Object.freeze([
  'create_store',
  'create_campaign',
]);

/** Tools known to still allow direct dispatchTool bypass (documented exceptions). */
export const DIRECT_DISPATCH_ALLOWLIST = Object.freeze([
  'business_operations_api',
  'factory_runtime_internal',
  'vision_orchestration_internal',
  'capability_api_internal',
]);

/**
 * @typedef {'dedicated_checkpoint' | 'generic_kernel' | 'pipeline_internal' | 'direct_bypass_risk'} ToolKernelRoute
 */

/**
 * @param {string} toolName
 * @returns {ToolKernelRoute}
 */
export function resolveToolKernelRoute(toolName) {
  const tool = String(toolName ?? '').trim();
  if (!tool) return 'direct_bypass_risk';
  if (DEDICATED_KERNEL_WRAPPER_TOOLS.includes(tool)) return 'dedicated_checkpoint';
  if (isKernelOnlyIntakeTool(tool)) return 'dedicated_checkpoint';
  if (
    tool === 'mission.checkpoint' ||
    tool === 'mission.conditional' ||
    tool === 'mission_conditional_branch' ||
    tool === 'structured_store_build'
  ) {
    return 'pipeline_internal';
  }
  return 'generic_kernel';
}

/**
 * @param {string} toolName
 * @returns {boolean}
 */
export function toolSupportsCheckpoints(toolName) {
  const tool = String(toolName ?? '').trim();
  if (KERNEL_CHECKPOINT_TOOLS.has(tool)) return true;
  if (tool === 'mission.checkpoint' || tool === 'mission.conditional') return true;
  return false;
}

/**
 * @param {string} toolName
 * @returns {object}
 */
export function buildToolAuditEntry(toolName) {
  const tool = String(toolName ?? '').trim();
  const route = resolveToolKernelRoute(tool);
  return {
    toolName: tool,
    hasExecutor: listRegisteredExecutorTools().includes(tool),
    kernelRoute: route,
    hasKernelWrapper: route === 'dedicated_checkpoint' || route === 'generic_kernel',
    kernelOnly: isKernelOnlyIntakeTool(tool),
    dedicatedWrapper: DEDICATED_KERNEL_WRAPPER_TOOLS.includes(tool),
    checkpointCapable: toolSupportsCheckpoints(tool),
    emitsUnifiedEvents: route !== 'direct_bypass_risk',
  };
}

/**
 * @returns {object}
 */
export function buildToolExecutorAuditReport() {
  const tools = listRegisteredExecutorTools().sort();
  const entries = tools.map(buildToolAuditEntry);
  const summary = {
    totalExecutors: entries.length,
    dedicatedCheckpoint: entries.filter((e) => e.kernelRoute === 'dedicated_checkpoint').length,
    genericKernel: entries.filter((e) => e.kernelRoute === 'generic_kernel').length,
    pipelineInternal: entries.filter((e) => e.kernelRoute === 'pipeline_internal').length,
    kernelOnly: entries.filter((e) => e.kernelOnly).length,
    checkpointCapable: entries.filter((e) => e.checkpointCapable).length,
    documentedBypassAllowlist: DIRECT_DISPATCH_ALLOWLIST.length,
  };
  return {
    version: '1.0.0',
    generatedAt: new Date().toISOString(),
    summary,
    kernelOnlyTools: [...KERNEL_ONLY_INTAKE_TOOLS],
    dedicatedWrapperTools: [...DEDICATED_KERNEL_WRAPPER_TOOLS],
    entries,
  };
}

/**
 * @returns {string[]} Tools that must route through dispatchToolViaKernel when kernel mandatory.
 */
export function listGenericKernelRoutedTools() {
  return listRegisteredExecutorTools().filter(
    (tool) => resolveToolKernelRoute(tool) === 'generic_kernel',
  );
}
