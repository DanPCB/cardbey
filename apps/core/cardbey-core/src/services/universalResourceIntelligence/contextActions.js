/**
 * Phase 4 — context-aware candidate actions (replaces Shortlist-only UX).
 * URI understands where the user came from.
 */

import { CANDIDATE_ACTION, DESTINATION_ADAPTER, BUSINESS_TASK } from './types.js';

const ORIGIN_DEFAULT_ACTIONS = {
  display: [
    CANDIDATE_ACTION.USE_IN_DISPLAY,
    CANDIDATE_ACTION.COMPARE_ALTERNATIVES,
    CANDIDATE_ACTION.VIEW_RIGHTS,
    CANDIDATE_ACTION.EXPLAIN_RECOMMENDATION,
    CANDIDATE_ACTION.SAVE_COLLECTION,
  ],
  store_builder: [
    CANDIDATE_ACTION.USE_IN_CAMPAIGN,
    CANDIDATE_ACTION.USE_IN_WEBSITE,
    CANDIDATE_ACTION.VIEW_RIGHTS,
    CANDIDATE_ACTION.EXPLAIN_RECOMMENDATION,
  ],
  website_builder: [
    CANDIDATE_ACTION.USE_IN_WEBSITE,
    CANDIDATE_ACTION.COMPARE_ALTERNATIVES,
    CANDIDATE_ACTION.VIEW_RIGHTS,
    CANDIDATE_ACTION.EXPLAIN_RECOMMENDATION,
  ],
  creator_studio: [
    CANDIDATE_ACTION.USE_IN_CREATOR_STUDIO,
    CANDIDATE_ACTION.SAVE_COLLECTION,
    CANDIDATE_ACTION.VIEW_RIGHTS,
    CANDIDATE_ACTION.EXPLAIN_RECOMMENDATION,
  ],
  social: [
    CANDIDATE_ACTION.USE_IN_SOCIAL,
    CANDIDATE_ACTION.COMPARE_ALTERNATIVES,
    CANDIDATE_ACTION.VIEW_RIGHTS,
  ],
  assistant: [
    CANDIDATE_ACTION.USE_IN_CAMPAIGN,
    CANDIDATE_ACTION.USE_IN_DISPLAY,
    CANDIDATE_ACTION.USE_IN_SOCIAL,
    CANDIDATE_ACTION.USE_IN_WEBSITE,
    CANDIDATE_ACTION.EXPLAIN_RECOMMENDATION,
    CANDIDATE_ACTION.VIEW_RIGHTS,
  ],
  admin_workspace: [
    CANDIDATE_ACTION.USE_IN_DISPLAY,
    CANDIDATE_ACTION.USE_IN_WEBSITE,
    CANDIDATE_ACTION.USE_IN_SOCIAL,
    CANDIDATE_ACTION.USE_IN_CAMPAIGN,
    CANDIDATE_ACTION.USE_IN_CREATOR_STUDIO,
    CANDIDATE_ACTION.SAVE_COLLECTION,
    CANDIDATE_ACTION.COMPARE_ALTERNATIVES,
    CANDIDATE_ACTION.VIEW_RIGHTS,
    CANDIDATE_ACTION.EXPLAIN_RECOMMENDATION,
    CANDIDATE_ACTION.SHORTLIST,
  ],
};

const ACTION_TO_DESTINATION = {
  [CANDIDATE_ACTION.USE_IN_DISPLAY]: DESTINATION_ADAPTER.DISPLAY_PLAYLIST_DRAFT,
  [CANDIDATE_ACTION.USE_IN_WEBSITE]: DESTINATION_ADAPTER.STOREFRONT_HERO_DRAFT,
  [CANDIDATE_ACTION.USE_IN_SOCIAL]: DESTINATION_ADAPTER.SOCIAL_CONTENT_DRAFT,
  [CANDIDATE_ACTION.USE_IN_CAMPAIGN]: DESTINATION_ADAPTER.PROMOTION_DRAFT,
  [CANDIDATE_ACTION.USE_IN_CREATOR_STUDIO]: DESTINATION_ADAPTER.SUITCASE_REFERENCE_COLLECTION,
  [CANDIDATE_ACTION.SAVE_COLLECTION]: DESTINATION_ADAPTER.SUITCASE_REFERENCE_COLLECTION,
};

/**
 * @param {object} opts
 * @param {string} [opts.origin] — display | store_builder | website_builder | creator_studio | social | assistant | admin_workspace
 * @param {string} [opts.businessTask]
 * @param {object} [opts.explanation]
 * @param {object} [opts.rights]
 */
export function buildContextActions(opts = {}) {
  const origin = resolveOrigin(opts);
  const keys = ORIGIN_DEFAULT_ACTIONS[origin] || ORIGIN_DEFAULT_ACTIONS.assistant;
  const decision =
    opts.rights?.decision?.decision ||
    opts.explanation?.rightsDecision ||
    'NEEDS_REVIEW';

  return keys.map((action) => ({
    action,
    label: labelFor(action),
    destination: ACTION_TO_DESTINATION[action] || null,
    enabled: action === CANDIDATE_ACTION.VIEW_RIGHTS ||
      action === CANDIDATE_ACTION.EXPLAIN_RECOMMENDATION ||
      action === CANDIDATE_ACTION.COMPARE_ALTERNATIVES ||
      decision !== 'REJECTED',
    requiresConfirm: Boolean(ACTION_TO_DESTINATION[action]),
    origin,
  }));
}

function resolveOrigin(opts) {
  if (opts.origin) return opts.origin;
  const task = opts.businessTask;
  if (task === BUSINESS_TASK.CREATE_DISPLAY_PLAYLIST) return 'display';
  if (task === BUSINESS_TASK.CREATE_PROMOTION || task === BUSINESS_TASK.ASSISTANT_ASSEMBLE_DRAFT) {
    return 'store_builder';
  }
  if (task === BUSINESS_TASK.CREATE_STOREFRONT_HERO || task === BUSINESS_TASK.CREATE_LANDING_HERO) {
    return 'website_builder';
  }
  if (task === BUSINESS_TASK.CREATE_SOCIAL_POST) return 'social';
  if (task === BUSINESS_TASK.ASSEMBLE_CREATOR_PACK) return 'creator_studio';
  if (opts.consumer === 'resource_workspace' || opts.admin) return 'admin_workspace';
  return 'assistant';
}

function labelFor(action) {
  switch (action) {
    case CANDIDATE_ACTION.USE_IN_WEBSITE:
      return 'Use in Website';
    case CANDIDATE_ACTION.USE_IN_DISPLAY:
      return 'Use in Display';
    case CANDIDATE_ACTION.USE_IN_SOCIAL:
      return 'Use in Social';
    case CANDIDATE_ACTION.USE_IN_CAMPAIGN:
      return 'Use in Campaign';
    case CANDIDATE_ACTION.USE_IN_CREATOR_STUDIO:
      return 'Use in Creator Studio';
    case CANDIDATE_ACTION.SAVE_COLLECTION:
      return 'Save Collection';
    case CANDIDATE_ACTION.COMPARE_ALTERNATIVES:
      return 'Compare Alternatives';
    case CANDIDATE_ACTION.VIEW_RIGHTS:
      return 'View Rights';
    case CANDIDATE_ACTION.EXPLAIN_RECOMMENDATION:
      return 'Explain Recommendation';
    case CANDIDATE_ACTION.SHORTLIST:
      return 'Shortlist (ops)';
    default:
      return action;
  }
}

export function actionToDestination(action) {
  return ACTION_TO_DESTINATION[action] || null;
}
