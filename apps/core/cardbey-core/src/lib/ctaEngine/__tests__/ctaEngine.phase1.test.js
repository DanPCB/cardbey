import { beforeEach, describe, expect, it } from 'vitest';
import { _resetCapabilityRegistryForTests } from '../capabilityRegistry/index.js';
import { _resetCtaRegistryForTests } from '../ctaRegistry/index.js';
import { _resetProvidersForTests } from '../providers/providerRegistry.js';
import { _resetBootstrapForTests, bootstrapCtaEngine } from '../bootstrap.js';
import { _resetPersonalisationForTests, markCapabilityCompleted } from '../personalisation/index.js';
import { _drainAnalyticsForTests } from '../analytics/index.js';
import {
  getActiveCta,
  dismissCta,
  recordInteraction,
  buildRenderModel,
  resolveStorefrontPrimaryCta,
  evaluateContext,
} from '../api/index.js';
import { resolveStoreCommerce } from '../../storeTransactionMode.js';

describe('CTA Engine Phase 1', () => {
  beforeEach(() => {
    _resetCapabilityRegistryForTests();
    _resetCtaRegistryForTests();
    _resetProvidersForTests();
    _resetBootstrapForTests();
    _resetPersonalisationForTests();
    _drainAnalyticsForTests();
    bootstrapCtaEngine();
  });

  it('resolveStorefrontPrimaryCta matches resolveStoreCommerce labels', () => {
    const cases = [
      { businessType: 'restaurant', expectAction: 'order' },
      { businessType: 'hair salon', expectAction: 'booking' },
      { businessType: 'retail boutique', expectAction: 'order' },
    ];
    for (const c of cases) {
      const commerce = resolveStoreCommerce({ businessType: c.businessType });
      const primary = resolveStorefrontPrimaryCta({ businessType: c.businessType });
      expect(primary.label).toBe(commerce.ctaLabel);
      expect(primary.action).toBe(commerce.ctaAction);
      expect(primary.source).toBe('cta_engine.storefront_primary');
      expect(primary.action).toBe(c.expectAction);
    }
  });

  it('marketplace explore surfaces Create store as primary', () => {
    const result = getActiveCta({
      pageKind: 'marketplace',
      journeyStage: 'explore',
      authenticated: false,
      device: 'mobile',
    });
    expect(result.primary).toBeTruthy();
    expect(result.primary.capabilityId).toBe('create_store');
    expect(result.primary.slot).toBe('primary');
  });

  it('personalisation hides Create store after completion and prefers loyalty', () => {
    markCapabilityCompleted('user_1', 'create_store');
    const result = getActiveCta(
      {
        pageKind: 'marketing',
        authenticated: true,
        audience: 'owner',
        journeyStage: 'operate',
      },
      { subjectKey: 'user_1' },
    );
    expect(result.primary?.capabilityId).not.toBe('create_store');
    const ids = [result.primary, ...result.secondary].filter(Boolean).map((r) => r.capabilityId);
    expect(ids).toContain('launch_loyalty');
  });

  it('storefront ranking prefers store commerce CTAs', () => {
    const result = getActiveCta({
      pageKind: 'storefront',
      commerceMode: 'booking',
      businessType: 'salon',
      authenticated: false,
      audience: 'visitor',
    });
    expect(result.primary?.provider).toBe('store');
    expect(['store.book', 'store.order', 'store.enquire', 'store.request_quote']).toContain(
      result.primary?.capabilityId,
    );
  });

  it('loyalty section boosts launch_loyalty via scroll triggers', () => {
    markCapabilityCompleted('user_2', 'create_store');
    const result = getActiveCta(
      {
        pageKind: 'marketing',
        section: 'loyalty',
        authenticated: true,
        journeyStage: 'operate',
      },
      { subjectKey: 'user_2' },
    );
    const pool = [result.primary, ...result.secondary, ...result.deferred].filter(Boolean);
    expect(pool.some((r) => r.capabilityId === 'launch_loyalty')).toBe(true);
  });

  it('dismiss removes variant from later evaluations', () => {
    dismissCta('user_3', 'create_store.primary');
    const result = getActiveCta(
      { pageKind: 'marketplace', journeyStage: 'explore' },
      { subjectKey: 'user_3' },
    );
    // Other create_store variants may still exist; ensure dismissed id is gone
    const all = [result.primary, ...result.secondary, ...result.hidden, ...result.deferred].filter(Boolean);
    expect(all.every((r) => r.variantId !== 'create_store.primary')).toBe(true);
  });

  it('buildRenderModel is placement-agnostic with mobile safety hints', () => {
    const result = getActiveCta({ pageKind: 'marketplace' });
    const model = buildRenderModel(result.primary, 'sticky');
    expect(model?.label).toBeTruthy();
    expect(model?.styleHints?.safeArea).toBe(true);
    expect(model?.styleHints?.avoidComposer).toBe(true);
  });

  it('evaluateContext infers semantic pageKind and journey', () => {
    const ctx = evaluateContext({ route: '/s/pho-ngon', authenticated: false });
    expect(ctx.pageKind).toBe('storefront');
    expect(ctx.journeyStage).toBe('explore');
  });

  it('recordInteraction emits analytics event', () => {
    recordInteraction({ capabilityId: 'create_store', variantId: 'create_store.primary' });
    const events = _drainAnalyticsForTests();
    expect(events.some((e) => e.type === 'click' && e.capabilityId === 'create_store')).toBe(true);
  });
});
