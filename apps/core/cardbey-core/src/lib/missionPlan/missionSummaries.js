/**
 * Mission summary copy keyed by summaryKey from intent pipeline registry.
 */

const SUMMARIES = {
  store_ready: 'Your store draft is ready.',
  descriptions_ready: 'Descriptions have been rewritten.',
  tags_ready: 'Tags have been generated for your products.',
  offer_ready: 'Your offer is ready.',
  promotion_ready: 'Your campaign is ready.',
  promo_shown: 'Your promotion is now showing on your store.',
  content_ready: 'Your social content is ready.',
  categories_reviewed: 'Your categories have been reviewed.',
  hero_updated: 'Your hero image has been updated.',
  task_complete: 'Your mission is complete.',
  mcp_context_ok: 'Product context loaded.',
  mcp_business_ok: 'Business context loaded.',
  mcp_store_assets_ok: 'Store assets context loaded.',
};

/**
 * @param {string} summaryKey
 * @returns {string}
 */
export function getSummaryText(summaryKey) {
  return SUMMARIES[summaryKey] ?? SUMMARIES.task_complete;
}
