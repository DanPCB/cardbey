/**
 * Capability resolution for direct-tool intake (primary vs fallback offer vs unavailable).
 * Does not auto-execute fallbacks — returns plans for UI confirmation.
 */

import {
  FALLBACK_TOOL_META,
  getCapabilityPlan,
  getFallbackTools,
  isToolProviderAvailable,
  explainCapabilityFallback,
} from './capabilityRegistry.js';
import { resolveActiveStoreContext } from './resolveActiveStoreContext.js';

/**
 * @typedef {'primary' | 'fallback_offer' | 'unavailable' | 'missing_context'} CapabilityStrategy
 */

/**
 * @typedef {Object} CapabilityFallbackOption
 * @property {string} label
 * @property {string} tool
 * @property {string} prompt
 * @property {string} artifactType
 * @property {string} description
 * @property {boolean} available
 * @property {string} [unavailableReason]
 */

/**
 * @typedef {Object} CapabilityExecutionPlan
 * @property {string} capability
 * @property {string} requestedTool
 * @property {string | null} selectedTool
 * @property {CapabilityStrategy} selectedStrategy
 * @property {string | null} unavailableReason
 * @property {string | null} fallbackReason
 * @property {string} userMessage
 * @property {string[]} requiredContext
 * @property {string[]} missingContext
 * @property {string | null} artifactTypeExpected
 * @property {CapabilityFallbackOption[]} fallbackOptions
 * @property {{ storeId: string | null; storeName: string | null; businessType: string | null; hasStoreImages: boolean }} storeContext
 */

/**
 * @param {{
 *   capability: string;
 *   requestedTool: string;
 *   userMessage?: string;
 *   locale?: string;
 *   context?: Record<string, unknown>;
 *   activeMission?: Record<string, unknown> | null;
 *   activeStore?: Record<string, unknown> | null;
 *   persistedIntent?: Record<string, unknown> | null;
 *   env?: NodeJS.ProcessEnv;
 * }} input
 * @returns {CapabilityExecutionPlan}
 */
export function resolveCapabilityExecutionPlan(input) {
  const capability = String(input.capability ?? 'unknown').trim();
  const requestedTool = String(input.requestedTool ?? '').trim();
  const locale = String(input.locale ?? 'en');
  const entry = getCapabilityPlan(capability);
  const storeContext = resolveActiveStoreContext({
    currentContext: input.context,
    activeMission: input.activeMission,
    activeStore: input.activeStore,
    persistedIntent: input.persistedIntent,
    userMessage: input.userMessage,
  });

  const requiredContext = [...(entry.requiredContext ?? [])];
  const missingContext = requiredContext.filter((key) => {
    if (key === 'storeId') return !storeContext.storeId;
    return false;
  });

  const primaryTool = entry.primaryTools?.[0] ?? requestedTool;
  const artifactTypeExpected = artifactTypeForTool(primaryTool);

  if (missingContext.length > 0) {
    const storeHint = storeContext.storeName ? ` (${storeContext.storeName})` : '';
    return {
      capability,
      requestedTool,
      selectedTool: null,
      selectedStrategy: 'missing_context',
      unavailableReason: null,
      fallbackReason: null,
      userMessage:
        locale === 'vi'
          ? `Bạn muốn dùng cửa hàng nào${storeHint}? Chọn cửa hàng đang hoạt động rồi thử lại.`
          : `Which store should I use for this promotion${storeHint}? Select an active store and try again.`,
      requiredContext,
      missingContext,
      artifactTypeExpected,
      fallbackOptions: [],
      storeContext,
    };
  }

  const primaryAvailability = isToolProviderAvailable(primaryTool, input.env);
  if (primaryAvailability.available) {
    return {
      capability,
      requestedTool,
      selectedTool: primaryTool,
      selectedStrategy: 'primary',
      unavailableReason: null,
      fallbackReason: null,
      userMessage:
        locale === 'vi'
          ? `Đang tạo ${entry.userFacingName}…`
          : `Creating your ${entry.userFacingName}…`,
      requiredContext,
      missingContext: [],
      artifactTypeExpected,
      fallbackOptions: buildFallbackOptions(capability, primaryTool, input.env),
      storeContext,
    };
  }

  const unavailableReason = primaryAvailability.reason ?? 'Primary capability is not connected yet.';
  const fallbackOptions = buildFallbackOptions(capability, primaryTool, input.env);
  const executableFallbacks = fallbackOptions.filter((o) => o.available);

  if (executableFallbacks.length > 0) {
    const first = executableFallbacks[0];
    return {
      capability,
      requestedTool,
      selectedTool: first.tool,
      selectedStrategy: 'fallback_offer',
      unavailableReason,
      fallbackReason: explainCapabilityFallback(capability, unavailableReason, first.tool),
      userMessage: buildFallbackOfferMessage(capability, unavailableReason, executableFallbacks, locale),
      requiredContext,
      missingContext: [],
      artifactTypeExpected: first.artifactType,
      fallbackOptions,
      storeContext,
    };
  }

  return {
    capability,
    requestedTool,
    selectedTool: null,
    selectedStrategy: 'unavailable',
    unavailableReason,
    fallbackReason: null,
    userMessage:
      locale === 'vi'
        ? `${unavailableReason} Hiện chưa có phương án thay thế nào được kết nối.`
        : `${unavailableReason} No alternative paths are connected yet.`,
    requiredContext,
    missingContext: [],
    artifactTypeExpected,
    fallbackOptions,
    storeContext,
  };
}

/**
 * @param {string} capability
 * @param {string} primaryTool
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {CapabilityFallbackOption[]}
 */
function buildFallbackOptions(capability, primaryTool, env) {
  const tools = getFallbackTools(capability).filter((t) => t && t !== primaryTool);
  return tools.map((tool) => {
    const meta = FALLBACK_TOOL_META[tool] ?? {
      label: tool,
      prompt: `Run ${tool} for my store`,
      artifactType: 'unknown',
      description: `use ${tool}`,
    };
    const avail = isToolProviderAvailable(tool, env);
    return {
      label: meta.label,
      tool,
      prompt: meta.prompt,
      artifactType: meta.artifactType,
      description: meta.description,
      available: avail.available,
      unavailableReason: avail.available ? undefined : avail.reason,
    };
  });
}

/**
 * @param {string} capability
 * @param {string} unavailableReason
 * @param {CapabilityFallbackOption[]} executableFallbacks
 * @param {string} locale
 */
function buildFallbackOfferMessage(capability, unavailableReason, executableFallbacks, locale) {
  const entry = getCapabilityPlan(capability);
  const name = entry.userFacingName ?? 'request';
  const lead =
    unavailableReason?.trim() ||
    (locale === 'vi'
      ? `Video AI trực tiếp chưa được kết nối.`
      : `Direct AI ${name} is not connected yet.`);

  if (locale === 'vi') {
    const alts = executableFallbacks.map((o) => o.label.toLowerCase()).join(', ');
    return `${lead} Tôi có thể: ${alts}. Chọn một phương án bên dưới.`;
  }

  const alts = executableFallbacks.map((o) => o.description).join('; ');
  return `${lead} I can ${alts}. Pick an option below.`;
}

/**
 * @param {string} tool
 */
function artifactTypeForTool(tool) {
  if (tool === 'video_generate_multimodal') return 'video';
  if (tool === 'generate_slideshow') return 'slideshow';
  if (tool === 'generate_poster' || tool === 'smart_visual') return 'image';
  if (tool === 'generate_social_posts' || tool === 'content_creator') return 'text_asset';
  return 'unknown';
}

/**
 * Intake responses must never claim completed for unavailable/fallback-offer paths.
 * @param {CapabilityExecutionPlan} plan
 */
export function intakeSuccessFromCapabilityPlan(plan) {
  return plan.selectedStrategy === 'primary';
}
