/**
 * Intent Graph v1: Generate top 3 next-best actions from intents and matches (rules-only).
 */

/**
 * Build top 3 action suggestions for a draft/store from inferred intents.
 * @param {{ intentKey: string, label: string }[]} intents - inferred intents (already capped)
 * @param {boolean} isDraft - true when draftStoreId set, false when storeId (committed)
 * @returns {{ rank: number, actionType: string, title: string, description: string, payload: object }[]}
 */
export function buildTopActions(intents, isDraft) {
  const actions = [];

  if (isDraft) {
    actions.push(
      { rank: 1, actionType: 'publish', title: 'Publish your store', description: 'Make your store live so customers can view it.', payload: {} },
      { rank: 2, actionType: 'create_promo', title: 'Create a promotion', description: 'Add a discount or offer to drive sales.', payload: {} },
      { rank: 3, actionType: 'add_qr', title: 'Add a QR code', description: 'Link print or in-store materials to your storefront.', payload: {} },
    );
  } else {
    actions.push(
      { rank: 1, actionType: 'create_promo', title: 'Create a promotion', description: 'Add a discount or offer to drive sales.', payload: {} },
      { rank: 2, actionType: 'add_qr', title: 'Add a QR code', description: 'Link print or in-store materials to your storefront.', payload: {} },
      { rank: 3, actionType: 'review_menu', title: 'Review menu items', description: 'Update descriptions or categories to match your intents.', payload: { intentKeys: intents.slice(0, 3).map((i) => i.intentKey) } },
    );
  }

  return actions.slice(0, 3);
}
