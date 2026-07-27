/**
 * Ranking — normally one primary CTA; secondary / hidden / deferred buckets.
 */

import { isCapabilityEligible, isVariantEligible } from '../eligibility/index.js';
import { listCapabilities } from '../capabilityRegistry/index.js';
import { listVariantsForCapability } from '../ctaRegistry/index.js';
import { listProviders } from '../providers/providerRegistry.js';

/**
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 * @param {import('../sharedTypes/index.js').CtaCapability} cap
 * @param {import('../sharedTypes/index.js').CtaVariant} variant
 * @returns {number}
 */
function scoreCandidate(ctx, cap, variant) {
  let score = Number(cap.priority ?? 50) + Number(variant.weight ?? 1) * 10;

  // Page affinity
  if (cap.provider === 'store' && ctx.pageKind === 'storefront') score += 40;
  if (cap.provider === 'platform' && (ctx.pageKind === 'marketing' || ctx.pageKind === 'marketplace')) {
    score += 35;
  }
  if (cap.provider === 'performer' && ctx.pageKind === 'performer') score += 45;
  if (cap.provider === 'discovery' && ctx.pageKind === 'discovery') score += 40;

  // Section affinity
  const contexts = variant.contexts || [];
  if (ctx.section && contexts.includes(ctx.section)) score += 30;

  // Journey
  if (ctx.journeyStage === 'explore' && cap.id === 'create_store') score += 25;
  if (ctx.journeyStage === 'operate' && ['launch_loyalty', 'import_menu', 'create_campaign'].includes(cap.id)) {
    score += 25;
  }
  if (ctx.journeyStage === 'grow' && ['create_campaign', 'generate_marketing', 'become_partner'].includes(cap.id)) {
    score += 20;
  }

  // Commerce match for store CTAs
  if (cap.provider === 'store' && ctx.commerceMode) {
    if (
      variant.action === ctx.commerceMode ||
      (variant.action === 'booking' && ctx.commerceMode === 'booking')
    ) {
      score += 20;
    }
  }

  // Soft-penalise recently active duplicates
  if ((ctx.recentActivity || []).includes(cap.id)) score -= 15;

  return score;
}

/**
 * Collect candidates from global registries + providers.
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 */
/**
 * @param {import('../sharedTypes/index.js').CtaCapability} cap
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 */
function providerMatchesPage(cap, ctx) {
  const kind = ctx.pageKind || 'unknown';
  if (cap.provider === 'store') return kind === 'storefront' || kind === 'unknown';
  if (cap.provider === 'platform') return kind !== 'storefront';
  if (cap.provider === 'performer') return kind === 'performer' || kind === 'unknown';
  if (cap.provider === 'discovery') return kind === 'discovery' || kind === 'marketplace' || kind === 'unknown';
  if (cap.provider === 'campaign') return true;
  return true;
}

function collectCandidates(ctx) {
  /** @type {Array<{ cap: import('../sharedTypes/index.js').CtaCapability, variant: import('../sharedTypes/index.js').CtaVariant, sectionDeferred?: boolean }>} */
  const out = [];
  const providers = listProviders();

  /** Prefer provider surface filtering when bootstrapped; else scan registry. */
  const caps =
    providers.length > 0
      ? providers.flatMap((p) => p.listCapabilities(ctx) || [])
      : listCapabilities().filter((c) => providerMatchesPage(c, ctx));

  const seenCap = new Set();
  for (const cap of caps) {
    if (!cap?.id || seenCap.has(cap.id)) continue;
    seenCap.add(cap.id);
    if (!providerMatchesPage(cap, ctx)) continue;
    const elig = isCapabilityEligible(cap, ctx);
    if (!elig.ok) continue;

    let variants = [];
    for (const p of providers) {
      const fromP = p.listVariants(ctx, cap) || [];
      if (fromP.length) variants = variants.concat(fromP);
    }
    if (!variants.length) variants = listVariantsForCapability(cap.id);
    if (!variants.length) {
      variants = [
        {
          id: `${cap.id}.default`,
          capabilityId: cap.id,
          label: cap.title,
          action: cap.meta?.defaultAction,
          placements: ['sticky', 'inline'],
          contexts: [],
          weight: 1,
        },
      ];
    }

    const seenVar = new Set();
    for (const variant of variants) {
      if (!variant?.id || seenVar.has(variant.id)) continue;
      seenVar.add(variant.id);
      const ve = isVariantEligible(variant, ctx);
      if (!ve.ok) continue;
      out.push({ cap, variant, sectionDeferred: ve.reason === 'section_deferred' });
    }
  }

  return out;
}

/**
 * @param {import('../sharedTypes/index.js').CtaSemanticContext} ctx
 * @param {{ maxSecondary?: number }} [opts]
 * @returns {import('../sharedTypes/index.js').CtaEvaluateResult}
 */
export function rankCtas(ctx, opts = {}) {
  const maxSecondary = opts.maxSecondary ?? 3;
  const candidates = collectCandidates(ctx);

  /** @type {import('../sharedTypes/index.js').RankedCta[]} */
  const ranked = candidates.map(({ cap, variant, sectionDeferred }) => {
    const score = scoreCandidate(ctx, cap, variant);
    /** @type {import('../sharedTypes/index.js').CtaSlotKind} */
    let slot = 'secondary';
    if (sectionDeferred && ctx.section) slot = 'deferred';
    return {
      capabilityId: cap.id,
      variantId: variant.id,
      label: variant.label,
      sublabel: variant.sublabel,
      action: variant.action,
      deepLink: cap.deepLink,
      provider: cap.provider,
      score,
      slot,
      reasons: sectionDeferred ? ['section_deferred'] : ['ranked'],
      proposedAction: cap.proposedAction,
      analyticsId: cap.analyticsId || variant.id,
    };
  });

  ranked.sort((a, b) => b.score - a.score);

  /** Dedupe by capability — keep best variant */
  const seen = new Set();
  const unique = [];
  for (const row of ranked) {
    if (seen.has(row.capabilityId)) continue;
    seen.add(row.capabilityId);
    unique.push(row);
  }

  const deferred = unique.filter((r) => r.slot === 'deferred');
  const active = unique.filter((r) => r.slot !== 'deferred');

  const primary = active[0] ? { ...active[0], slot: 'primary' } : null;
  const secondary = active.slice(1, 1 + maxSecondary).map((r) => ({ ...r, slot: 'secondary' }));
  const hidden = active.slice(1 + maxSecondary).map((r) => ({ ...r, slot: 'hidden' }));

  return { primary, secondary, hidden, deferred, context: ctx };
}
