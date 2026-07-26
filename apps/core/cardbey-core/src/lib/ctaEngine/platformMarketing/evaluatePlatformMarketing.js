/**
 * Phase 2 marketing evaluate — platform provider only, section-aware.
 */

import { bootstrapCtaEngine } from '../bootstrap.js';
import { registerCapability, getCapability } from '../capabilityRegistry/index.js';
import { registerCtaVariant, getCtaVariant } from '../ctaRegistry/index.js';
import { evaluateContext } from '../contextResolver/index.js';
import { rankCtas } from '../ranking/index.js';
import { applyScrollBoost } from '../triggerEngine/index.js';
import { buildRenderBundle } from '../renderModel/index.js';
import { applyPersonalisation } from '../personalisation/index.js';
import { recordCtaEvent } from '../analytics/index.js';
import {
  PHASE2_PLATFORM_CAPABILITIES,
  MARKETING_SECTION_CAPABILITY,
  normaliseMarketingSection,
} from './phase2Capabilities.js';

const ENGINE_VERSION = 'cta-engine-phase2';
const CONSUMER_VERSION = 'platform-marketing-v1';

let phase2Seeded = false;

export function ensurePhase2PlatformCapabilities() {
  bootstrapCtaEngine();
  if (phase2Seeded) return;
  for (const row of PHASE2_PLATFORM_CAPABILITIES) {
    const existing = getCapability(row.id);
    // Eligibility stays open for guests; action.requiresAuth drives login redirect.
    if (!existing) {
      registerCapability({
        id: row.id,
        title: row.title,
        description: row.description,
        category: row.category,
        provider: 'platform',
        priority: row.priority,
        requiresAuth: false,
        completionKey: row.completionKey,
        analyticsId: row.analyticsId,
        deepLink: row.deepLink,
        proposedAction: row.proposedAction,
        dependencies: [],
        meta: {
          action: row.action,
          phase: 2,
          authRequiredForActivation: row.requiresAuth,
          featureDependencies: row.featureDependencies || [],
        },
      });
    } else {
      existing.meta = {
        ...(existing.meta || {}),
        action: row.action,
        phase: 2,
        authRequiredForActivation: row.requiresAuth,
        featureDependencies: row.featureDependencies || [],
      };
      existing.requiresAuth = false;
      existing.dependencies = [];
    }
    const variantId = `${row.id}.marketing`;
    if (!getCtaVariant(variantId)) {
      registerCtaVariant({
        id: variantId,
        capabilityId: row.id,
        label: row.variantLabel,
        contexts: row.contexts,
        placements: ['sticky', 'floating', 'inline'],
        weight: 5,
        meta: { action: row.action },
      });
    }
  }
  phase2Seeded = true;
}

/**
 * @param {Partial<import('../sharedTypes/index.js').CtaSemanticContext> & { section?: string }} raw
 * @param {{ subjectKey?: string }} [opts]
 */
export function evaluatePlatformMarketingCta(raw = {}, opts = {}) {
  ensurePhase2PlatformCapabilities();
  const section = normaliseMarketingSection(raw.section);
  const subjectKey = opts.subjectKey || 'anonymous';

  const preferredCap = section ? MARKETING_SECTION_CAPABILITY[section] : null;
  const ctx = evaluateContext(
    applyPersonalisation(
      {
        ...raw,
        pageKind: 'marketing',
        section: section || raw.section || null,
        // Map semantic section into trigger engine lowercase hints
        extras: {
          ...(raw.extras || {}),
          marketingSection: section,
          preferredCapabilityId: preferredCap,
          engineVersion: ENGINE_VERSION,
          consumerVersion: CONSUMER_VERSION,
        },
      },
      subjectKey,
    ),
  );

  // Prefer marketing section key as section for scroll boost (lowercase aliases)
  if (section === 'STORE_CREATION') ctx.section = 'store_creation';
  else if (section === 'LOYALTY') ctx.section = 'loyalty';
  else if (section === 'MENU_IMPORT' || section === 'PRODUCTS_SERVICES') ctx.section = 'catalog';
  else if (section === 'PROFILE_IDENTITY') ctx.section = 'discovery';
  else if (section === 'PLATFORM_OVERVIEW') ctx.section = null;

  let result = rankCtas(ctx, { maxSecondary: 2 });
  result = applyScrollBoost(result, ctx);

  // Hard preference: if section maps to a capability and it is eligible, promote to primary
  if (preferredCap) {
    const pool = [result.primary, ...result.secondary, ...result.deferred, ...result.hidden].filter(Boolean);
    const hit = pool.find((r) => r.capabilityId === preferredCap && r.provider === 'platform');
    if (hit) {
      const rest = pool.filter((r) => r.capabilityId !== preferredCap && r.provider === 'platform');
      result = {
        ...result,
        primary: { ...hit, slot: 'primary', score: hit.score + 100, reasons: [...(hit.reasons || []), 'section_preference'] },
        secondary: rest.slice(0, 2).map((r) => ({ ...r, slot: 'secondary' })),
        deferred: [],
        hidden: rest.slice(2).map((r) => ({ ...r, slot: 'hidden' })),
      };
    }
  }

  // Provider scope: never return store CTAs on marketing consumer
  const guard = (row) => row && row.provider === 'platform';
  if (result.primary && !guard(result.primary)) result.primary = null;
  result.secondary = (result.secondary || []).filter(guard);
  result.hidden = (result.hidden || []).filter(guard);
  result.deferred = (result.deferred || []).filter(guard);

  const bundle = buildRenderBundle(result, { primaryPlacement: 'floating' });

  // Attach serialisable action descriptors
  const attachAction = (model) => {
    if (!model) return null;
    const cap = getCapability(model.capabilityId);
    const action = cap?.meta?.action || PHASE2_PLATFORM_CAPABILITIES.find((c) => c.id === model.capabilityId)?.action;
    return {
      ...model,
      meta: {
        ...(model.meta || {}),
        action,
        engineVersion: ENGINE_VERSION,
        consumerVersion: CONSUMER_VERSION,
        semanticSection: section,
        providerId: 'platform',
      },
    };
  };

  recordCtaEvent({
    type: 'impression',
    capabilityId: bundle.primary?.capabilityId,
    variantId: bundle.primary?.variantId,
    analyticsId: bundle.primary?.analyticsId,
    placement: 'floating',
    surface: 'platform_marketing',
    meta: {
      event: 'cta_ranked_primary',
      semanticSection: section,
      authenticated: Boolean(ctx.authenticated),
      engineVersion: ENGINE_VERSION,
      consumerVersion: CONSUMER_VERSION,
    },
  });

  return {
    ok: true,
    primary: attachAction(bundle.primary),
    secondary: (bundle.secondary || []).map(attachAction).filter(Boolean),
    context: ctx,
    engineVersion: ENGINE_VERSION,
    consumerVersion: CONSUMER_VERSION,
  };
}

/** @internal */
export function _resetPhase2SeedForTests() {
  phase2Seeded = false;
}
