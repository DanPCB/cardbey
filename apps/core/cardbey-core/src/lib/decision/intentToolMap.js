/**
 * Map canonical intent types to default intake tools (Phase 2 advisors).
 */

/** @type {Record<string, string>} */
export const INTENT_TO_TOOL = {
  create_store: 'create_store',
  create_store_from_upload: 'create_store',
  create_store_first: 'create_store',
  publish_store: 'publish_store',
  add_product: 'add_product',
  import_products: 'import_catalog',
  create_campaign: 'create_campaign',
  launch_campaign: 'launch_campaign',
  generate_graphic: 'create_promotion_graphic',
  setup_loyalty: 'setup_loyalty_program',
  upload_asset: 'upload_store_asset',
  analyze_asset: 'ingest_asset_for_intent_detection',
  analyze_document: 'analyze_document',
  ingest_document: 'ingest_document',
  view_analytics: 'get_store_analytics',
  continue_workflow: 'general_chat',
  clarification: 'general_chat',
  general_chat: 'general_chat',
  unknown: 'general_chat',
  guide_to_sign_in: 'general_chat',
  select_store_first: 'general_chat',
};

/**
 * @param {string} intent
 * @param {string | null | undefined} [suggestedTool]
 */
export function resolveToolForIntent(intent, suggestedTool) {
  const explicit = String(suggestedTool ?? '').trim();
  if (explicit) return explicit;
  const key = String(intent ?? '').trim();
  return INTENT_TO_TOOL[key] ?? 'general_chat';
}

/**
 * Normalize legacy classification tool for comparison.
 * @param {string | null | undefined} tool
 */
export function normalizeLegacyTool(tool) {
  const t = String(tool ?? '').trim();
  if (!t) return 'general_chat';
  if (t === 'ingest_asset_for_intent_detection') return 'ingest_asset_for_intent_detection';
  if (t === 'analyze_content') return 'general_chat';
  return t;
}

/**
 * @param {string} shadowTool
 * @param {string} legacyTool
 */
export function toolsAgree(shadowTool, legacyTool) {
  const a = normalizeLegacyTool(shadowTool);
  const b = normalizeLegacyTool(legacyTool);
  if (a === b) return true;
  // create_store family equivalence for upload path
  if (a === 'create_store' && b === 'create_store') return true;
  if (
    (a === 'ingest_asset_for_intent_detection' && b === 'ingest_asset_for_intent_detection') ||
    (a === 'ingest_asset_for_intent_detection' && b === 'analyze_content')
  ) {
    return true;
  }
  return false;
}
