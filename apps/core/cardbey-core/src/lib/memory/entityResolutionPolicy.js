/**
 * Intent-gated entity resolution — product/store DB lookups run only after classification,
 * and only for entity types the classified tool actually needs.
 */

const STORE_SETUP_TOOLS = new Set(['create_store', 'create_mini_website', 'generate_mini_website']);

const PRODUCT_TOOL_NAME_RE =
  /\b(product|menu|item|catalog|sku|inventory|price|promotion|campaign)\b/i;

/**
 * @param {Record<string, unknown> | null | undefined} sessionContext
 * @returns {boolean}
 */
export function isStoreCreationSessionContext(sessionContext) {
  const ctx = sessionContext && typeof sessionContext === 'object' ? sessionContext : {};
  const form = ctx.storeCreateForm;
  if (form && typeof form === 'object' && String(form.storeName ?? '').trim().length >= 2) {
    return true;
  }
  const flow = String(ctx.currentFlow ?? ctx.intentSourceContext?.currentFlow ?? '')
    .trim()
    .toLowerCase();
  if (flow === 'store_creation' || flow === 'store_setup') return true;
  const primary = String(ctx.primaryMode ?? ctx.primaryModeHint ?? '')
    .trim()
    .toLowerCase();
  return primary === 'create' || primary === 'store_setup' || primary === 'website';
}

/**
 * Whether to run message → entity ref extraction + DB resolution after classifyIntent.
 *
 * @param {{ tool?: string; executionPath?: string } | null | undefined} classification
 * @param {Record<string, unknown> | null | undefined} [sessionContext]
 * @returns {boolean}
 */
export function shouldResolveMessageEntitiesAfterClassification(classification, sessionContext) {
  const tool = String(classification?.tool ?? '').trim();
  const path = String(classification?.executionPath ?? '').trim();

  if (!tool) return false;
  if (STORE_SETUP_TOOLS.has(tool)) return false;
  if (path === 'clarify' || path === 'chat' || path === 'service_request') return false;
  if (isStoreCreationSessionContext(sessionContext)) return false;

  return true;
}

/**
 * @param {string | null | undefined} toolName
 * @param {{ parameterSchema?: { required?: string[] }; requiresStore?: boolean } | null | undefined} toolDef
 * @param {string[]} [missingParams]
 * @returns {Set<string>}
 */
export function entityTypesRequiredForTool(toolName, toolDef, missingParams = []) {
  const types = new Set();
  const tool = String(toolName ?? '').trim();
  if (!tool || STORE_SETUP_TOOLS.has(tool) || tool === 'general_chat') {
    return types;
  }

  const required = Array.isArray(toolDef?.parameterSchema?.required)
    ? toolDef.parameterSchema.required
    : [];
  const missing = Array.isArray(missingParams) ? missingParams : [];

  if (required.includes('storeId') || toolDef?.requiresStore || missing.includes('storeId')) {
    types.add('store');
  }
  if (required.includes('productId') || missing.includes('productId') || PRODUCT_TOOL_NAME_RE.test(tool)) {
    types.add('product');
  }
  if (required.includes('campaignId') || missing.includes('campaignId') || tool.includes('campaign')) {
    types.add('campaign');
  }

  return types;
}

/**
 * @param {import('./entityResolver.js').ResolutionError[]} errors
 * @param {Set<string>} allowedTypes
 * @returns {import('./entityResolver.js').ResolutionError[]}
 */
export function filterResolutionErrorsForEntityTypes(errors, allowedTypes) {
  const list = Array.isArray(errors) ? errors : [];
  if (!allowedTypes || allowedTypes.size === 0) return [];
  return list.filter((e) => e && allowedTypes.has(e.entityType));
}
