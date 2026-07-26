/**
 * Canonical CTA Engine API — products call here; never invent local ranking.
 */

import { bootstrapCtaEngine } from '../bootstrap.js';
import { registerCapability, getCapability, listCapabilities } from '../capabilityRegistry/index.js';
import { registerCtaVariant, getCtaVariant, listVariantsForCapability } from '../ctaRegistry/index.js';
import { registerProvider, getProvider, listProviders } from '../providers/providerRegistry.js';
import { evaluateContext } from '../contextResolver/index.js';
import { rankCtas } from '../ranking/index.js';
import { applyScrollBoost, evaluateScrollTriggers } from '../triggerEngine/index.js';
import { buildRenderModel, buildRenderBundle } from '../renderModel/index.js';
import {
  recordImpression,
  recordInteraction,
  recordConversion,
  recordDismiss,
  setCtaAnalyticsSink,
} from '../analytics/index.js';
import {
  dismissCta as rememberDismiss,
  markCapabilityCompleted,
  applyPersonalisation,
} from '../personalisation/index.js';
import { resolveStorefrontPrimaryCta } from '../resolveStorefrontPrimaryCta.js';

function ensureBoot() {
  bootstrapCtaEngine();
}

/**
 * @param {Partial<import('../sharedTypes/index.js').CtaSemanticContext>} rawContext
 * @param {{ subjectKey?: string, maxSecondary?: number, applyScroll?: boolean }} [opts]
 */
export function getActiveCta(rawContext = {}, opts = {}) {
  ensureBoot();
  const subjectKey = opts.subjectKey || 'anonymous';
  let ctx = evaluateContext(applyPersonalisation(rawContext, subjectKey));
  let result = rankCtas(ctx, { maxSecondary: opts.maxSecondary });
  if (opts.applyScroll !== false) {
    result = applyScrollBoost(result, ctx);
  }
  return result;
}

/**
 * @param {string} subjectKey
 * @param {string} variantId
 * @param {Record<string, unknown>} [meta]
 */
export function dismissCta(subjectKey, variantId, meta = {}) {
  ensureBoot();
  rememberDismiss(subjectKey, variantId);
  recordDismiss({ variantId, ...meta });
}

export {
  registerCapability,
  getCapability,
  listCapabilities,
  registerCtaVariant,
  getCtaVariant,
  listVariantsForCapability,
  registerProvider,
  getProvider,
  listProviders,
  evaluateContext,
  evaluateScrollTriggers,
  buildRenderModel,
  buildRenderBundle,
  recordImpression,
  recordInteraction,
  recordConversion,
  setCtaAnalyticsSink,
  markCapabilityCompleted,
  resolveStorefrontPrimaryCta,
  bootstrapCtaEngine,
};
