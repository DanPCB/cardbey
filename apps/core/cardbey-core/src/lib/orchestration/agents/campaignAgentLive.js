/**
 * Shared live path for campaign orchestration specialists.
 * Calls existing campaign tool executors via dispatchTool; does not change the coordinator.
 */

import { dispatchTool } from '../../toolDispatcher.js';
import { findPriorAgentResult } from './liveAgentHelpers.js';

/**
 * @param {object} context
 * @returns {object}
 */
export function campaignDispatchContext(context = {}) {
  const storeId = context.storeId ?? context.targetId ?? context.storeKnowledge?.id ?? null;
  return {
    storeId,
    missionId: context.missionId ?? null,
    userId: context.userId ?? context.actorId ?? null,
    actorId: context.userId ?? context.actorId ?? null,
    goal: context.goal ?? context.brief ?? null,
    source: 'campaign_orchestration_agent',
    runtimeOwned: true,
    performerRuntimeOwned: true,
  };
}

/**
 * @param {string} toolName
 * @param {object} input
 * @param {object} context
 */
export async function dispatchCampaignTool(toolName, input, context) {
  return dispatchTool(toolName, input, campaignDispatchContext(context));
}

/**
 * Unwrap tool output from DispatchResult ({ status, output }).
 * @param {object|null|undefined} dispatchResult
 */
export function unwrapToolOutput(dispatchResult) {
  if (!dispatchResult || typeof dispatchResult !== 'object') return null;
  if (dispatchResult.status === 'ok' && dispatchResult.output) return dispatchResult.output;
  if (dispatchResult.output && typeof dispatchResult.output === 'object') {
    return dispatchResult.output.partial ?? dispatchResult.output;
  }
  return null;
}

/**
 * Prefer nested brief/copy/graphics fields from prior agent results.
 * @param {object|null} prior
 * @param {string} key
 */
export function pickPriorField(prior, key) {
  if (!prior || typeof prior !== 'object') return null;
  if (prior[key] && typeof prior[key] === 'object') return prior[key];
  if (prior.result && typeof prior.result === 'object' && prior.result[key]) {
    return prior.result[key];
  }
  return null;
}

/**
 * @param {object} context
 * @param {object} task
 */
export async function loadCampaignPriors(context, task) {
  const briefPrior = await findPriorAgentResult(context, task, 'brief');
  const graphicsPrior = await findPriorAgentResult(context, task, 'graphics');
  const copyPrior = await findPriorAgentResult(context, task, 'copy');
  const qaPrior = await findPriorAgentResult(context, task, 'qa');
  const slideshowPrior = await findPriorAgentResult(context, task, 'slideshow');

  const brief = pickPriorField(briefPrior, 'brief') ?? (briefPrior?.objective ? briefPrior : null);
  const graphics =
    (Array.isArray(graphicsPrior?.graphics) ? graphicsPrior.graphics : null) ??
    (Array.isArray(pickPriorField(graphicsPrior, 'graphics'))
      ? pickPriorField(graphicsPrior, 'graphics')
      : []);
  const copy = pickPriorField(copyPrior, 'copy') ?? copyPrior;
  const qa = qaPrior && typeof qaPrior === 'object' ? qaPrior : null;
  const slideshowUrl =
    (typeof slideshowPrior?.slideshowUrl === 'string' && slideshowPrior.slideshowUrl) ||
    (typeof slideshowPrior?.slideshow?.url === 'string' && slideshowPrior.slideshow.url) ||
    null;

  return { brief, graphics: Array.isArray(graphics) ? graphics : [], copy, qa, slideshowUrl };
}

/**
 * Map tool / prior outputs into CampaignPackageCard shape.
 * @param {{
 *   goal?: string|null,
 *   storeId?: string|null,
 *   missionId?: string|null,
 *   brief?: object|null,
 *   graphics?: object[],
 *   copy?: object|null,
 *   qa?: object|null,
 *   slideshowUrl?: string|null,
 *   artifact?: object|null,
 * }} parts
 */
export function buildCampaignPackageUi(parts = {}) {
  const brief = parts.brief && typeof parts.brief === 'object' ? parts.brief : null;
  const copy = parts.copy && typeof parts.copy === 'object' ? parts.copy : null;
  const graphics = Array.isArray(parts.graphics) ? parts.graphics : [];
  const qa = parts.qa && typeof parts.qa === 'object' ? parts.qa : null;
  const artifact = parts.artifact && typeof parts.artifact === 'object' ? parts.artifact : null;

  const graphicUrl =
    graphics.find((g) => g && typeof g.url === 'string' && g.url.trim())?.url ??
    (typeof artifact?.url === 'string' ? artifact.url : null) ??
    (typeof artifact?.previewUrl === 'string' ? artifact.previewUrl : null) ??
    null;

  /** @type {Record<string, { caption?: string, hashtags?: string[] }>} */
  const platformCopy = {};
  if (copy?.platformVariants && typeof copy.platformVariants === 'object') {
    for (const [platform, text] of Object.entries(copy.platformVariants)) {
      platformCopy[platform] = {
        caption: String(text ?? ''),
        hashtags: Array.isArray(copy.hashtags) ? copy.hashtags.map(String) : [],
      };
    }
  } else if (copy) {
    platformCopy.instagram = {
      caption: [copy.headline, copy.caption, copy.cta].filter(Boolean).join('\n\n'),
      hashtags: Array.isArray(copy.hashtags) ? copy.hashtags.map(String) : [],
    };
    if (copy.caption || copy.headline) {
      platformCopy.facebook = {
        caption: [copy.headline, copy.caption, copy.cta].filter(Boolean).join('\n\n'),
        hashtags: Array.isArray(copy.hashtags) ? copy.hashtags.map(String) : [],
      };
    }
  }

  const passed = qa?.passed === true || qa?.approvedForAction === true;
  const hasVisual = Boolean(graphicUrl);
  const hasCopy = Boolean(String(copy?.headline ?? '').trim());

  return {
    campaignName:
      String(brief?.objective ?? parts.goal ?? 'Campaign').trim() || 'Campaign',
    keyMessage: String(copy?.headline ?? brief?.objective ?? '').trim() || null,
    callToAction: String(copy?.cta ?? '').trim() || null,
    targetAudience: String(brief?.targetAudience ?? '').trim() || null,
    platforms: Object.keys(platformCopy),
    storeId: parts.storeId ?? brief?.storeId ?? null,
    missionId: parts.missionId ?? null,
    assets: {
      poster: graphicUrl,
      slideshow: parts.slideshowUrl ?? null,
      video: null,
    },
    copy: platformCopy,
    qaReview: qa
      ? {
          passed: Boolean(passed),
          issues: Array.isArray(qa.issues) ? qa.issues.map(String) : [],
          suggestions: Array.isArray(qa.suggestions) ? qa.suggestions.map(String) : [],
          summary: typeof qa.summary === 'string' ? qa.summary : undefined,
        }
      : undefined,
    readyToPublish: Boolean(passed && hasVisual && hasCopy),
    brief,
    graphics,
    ...(artifact ? { artifact } : {}),
    stub: false,
  };
}
