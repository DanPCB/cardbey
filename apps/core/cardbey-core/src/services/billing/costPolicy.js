/**
 * Cost source tagging and policy: only paid_ai is chargeable and requires auth.
 * Template, manual, free_api remain free and unlimited.
 */

export const CostSource = {
  manual: 'manual',
  template: 'template',
  free_api: 'free_api',
  paid_ai: 'paid_ai',
};

/**
 * @param {string} costSource
 * @returns {boolean} true only for paid_ai
 */
export function isChargeable(costSource) {
  return costSource === CostSource.paid_ai;
}

/**
 * @param {string} costSource
 * @returns {boolean} true only for paid_ai
 */
export function requiresAuth(costSource) {
  return costSource === CostSource.paid_ai;
}

/** Action name -> default cost source for billing/guard */
export const ACTION_COST_SOURCE = {
  'draft.generate.template': CostSource.template,
  'draft.generate.ai.menu': CostSource.paid_ai,
  'draft.generate.ai.images': CostSource.paid_ai,
  'draft.generate.ai.full': CostSource.paid_ai,
  'images.import.pexels': CostSource.free_api,
  'images.import.unsplash': CostSource.free_api,
  'images.upload.manual': CostSource.manual,
};

/**
 * @param {string} actionName
 * @returns {string} cost source for that action
 */
export function getCostSourceForAction(actionName) {
  return ACTION_COST_SOURCE[actionName] ?? CostSource.manual;
}
