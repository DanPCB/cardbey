/**
 * Intake shortcut policy under Runtime Kernel mandatory mode.
 * Single place for which pre-classify / maintenance paths may bypass classifyIntent.
 */

import { areIntakeShortcutsAllowed } from '../runtime/kernelMandatory.js';
import { shouldPreserveCreateStoreShortcutWhenKernelMandatory } from '../intent/storeCreateFastPath.js';

/**
 * Tools that must use dedicated checkpoint kernel wrappers (not generic intake dispatch).
 * Generic dispatch is blocked; callers must use dispatchCreate*ViaKernel.
 */
export const KERNEL_CHECKPOINT_TOOLS = new Set(['create_store', 'create_campaign']);

/**
 * Tools that must never use intake direct-dispatch / maintenance bypass.
 * Includes checkpoint starters and governance-sensitive campaign activation.
 */
export const KERNEL_ONLY_INTAKE_TOOLS = new Set([
  'create_store',
  'create_campaign',
  'launch_campaign',
  'activate_campaigns',
]);

/**
 * @param {string} [toolName]
 * @returns {boolean}
 */
export function isKernelOnlyIntakeTool(toolName) {
  return KERNEL_ONLY_INTAKE_TOOLS.has(String(toolName ?? '').trim());
}

/**
 * @param {string} [toolName]
 * @returns {boolean}
 */
export function isKernelCheckpointTool(toolName) {
  return KERNEL_CHECKPOINT_TOOLS.has(String(toolName ?? '').trim());
}

/**
 * @param {string} toolName
 * @returns {string}
 */
export function getKernelOnlyIntakeToolMessage(toolName) {
  const tool = String(toolName ?? '').trim();
  if (tool === 'create_store') {
    return 'create_store must run through dispatchCreateStoreViaKernel.';
  }
  if (tool === 'create_campaign') {
    return 'create_campaign must run through dispatchCreateCampaignViaKernel.';
  }
  if (tool === 'launch_campaign') {
    return 'launch_campaign is deprecated for intake; use create_campaign checkpoint pipeline.';
  }
  if (tool === 'activate_campaigns') {
    return 'activate_campaigns must run through the mission pipeline kernel, not direct intake dispatch.';
  }
  return `${tool} must run through the unified runtime kernel.`;
}

/**
 * Pre-classify system shortcuts (device control, smart doc, create card, poster edit).
 * Under kernel mandatory only store-creation shortcuts may run before classifyIntent.
 *
 * @param {'device'|'smart_document'|'create_card'|'poster_edit'|'generic'} kind
 * @returns {boolean}
 */
export function isPreClassifyShortcutAllowed(kind) {
  if (areIntakeShortcutsAllowed()) return true;
  return false;
}

/**
 * Device intent runs before classifyIntent; defer to classifier under kernel mandatory.
 * @returns {boolean}
 */
export function isDeviceIntentPreClassifyAllowed() {
  return isPreClassifyShortcutAllowed('device');
}

/**
 * Performee slideshow deterministic override — use classifyIntent under kernel mandatory.
 * @returns {boolean}
 */
export function isPerformeeSlideshowOverrideAllowed() {
  return areIntakeShortcutsAllowed();
}

export { shouldPreserveCreateStoreShortcutWhenKernelMandatory };
