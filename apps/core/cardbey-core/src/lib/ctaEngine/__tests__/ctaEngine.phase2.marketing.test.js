import { beforeEach, describe, expect, it } from 'vitest';
import { _resetCapabilityRegistryForTests } from '../capabilityRegistry/index.js';
import { _resetCtaRegistryForTests } from '../ctaRegistry/index.js';
import { _resetProvidersForTests } from '../providers/providerRegistry.js';
import { _resetBootstrapForTests, bootstrapCtaEngine } from '../bootstrap.js';
import { _resetPersonalisationForTests, markCapabilityCompleted, dismissCta } from '../personalisation/index.js';
import {
  evaluatePlatformMarketingCta,
  _resetPhase2SeedForTests,
} from '../platformMarketing/evaluatePlatformMarketing.js';

describe('CTA Engine Phase 2 platform marketing', () => {
  beforeEach(() => {
    _resetCapabilityRegistryForTests();
    _resetCtaRegistryForTests();
    _resetProvidersForTests();
    _resetBootstrapForTests();
    _resetPersonalisationForTests();
    _resetPhase2SeedForTests();
    bootstrapCtaEngine();
  });

  it('STORE_CREATION section selects create_store', () => {
    const result = evaluatePlatformMarketingCta({ section: 'STORE_CREATION' });
    expect(result.primary?.capabilityId).toBe('create_store');
    expect(result.primary?.provider).toBe('platform');
    expect(result.primary?.label).toMatch(/store/i);
  });

  it('LOYALTY section selects launch_loyalty', () => {
    const result = evaluatePlatformMarketingCta({ section: 'LOYALTY' });
    expect(result.primary?.capabilityId).toBe('launch_loyalty');
  });

  it('MENU_IMPORT selects import_menu', () => {
    const result = evaluatePlatformMarketingCta({ section: 'MENU_IMPORT' });
    expect(result.primary?.capabilityId).toBe('import_menu');
  });

  it('PRODUCTS_SERVICES selects list_catalog', () => {
    const result = evaluatePlatformMarketingCta({ section: 'PRODUCTS_SERVICES' });
    expect(result.primary?.capabilityId).toBe('list_catalog');
  });

  it('PROFILE_IDENTITY selects create_profile and marks auth requirement in action', () => {
    const result = evaluatePlatformMarketingCta({ section: 'PROFILE_IDENTITY' });
    expect(result.primary?.capabilityId).toBe('create_profile');
    expect(result.primary?.meta?.action?.requiresAuth).toBe(true);
  });

  it('completed create_store is suppressed', () => {
    markCapabilityCompleted('user_m', 'create_store');
    const result = evaluatePlatformMarketingCta(
      { section: 'STORE_CREATION', authenticated: true },
      { subjectKey: 'user_m' },
    );
    expect(result.primary?.capabilityId).not.toBe('create_store');
  });

  it('never returns store provider CTAs', () => {
    const result = evaluatePlatformMarketingCta({ section: 'STORE_CREATION', pageKind: 'marketing' });
    const all = [result.primary, ...(result.secondary || [])].filter(Boolean);
    expect(all.every((r) => r.provider === 'platform')).toBe(true);
    expect(all.every((r) => !String(r.capabilityId).startsWith('store.'))).toBe(true);
  });

  it('dismiss suppresses that variant as primary', () => {
    dismissCta('user_d', 'create_store.marketing');
    const result = evaluatePlatformMarketingCta(
      { section: 'STORE_CREATION' },
      { subjectKey: 'user_d' },
    );
    expect(result.primary?.variantId).not.toBe('create_store.marketing');
  });

  it('empty-safe when nothing eligible after heavy completion', () => {
    for (const id of [
      'create_store',
      'create_profile',
      'list_catalog',
      'import_menu',
      'launch_loyalty',
      'learn_more',
    ]) {
      markCapabilityCompleted('done_user', id);
    }
    const result = evaluatePlatformMarketingCta({}, { subjectKey: 'done_user' });
    // May still surface other bootstrap platform caps — primary must not be a store.* id
    if (result.primary) {
      expect(result.primary.provider).toBe('platform');
      expect(String(result.primary.capabilityId).startsWith('store.')).toBe(false);
    }
  });

  it('action descriptors are serialisable (no functions)', () => {
    const result = evaluatePlatformMarketingCta({ section: 'STORE_CREATION' });
    const json = JSON.stringify(result.primary?.meta?.action);
    expect(json).toBeTruthy();
    expect(json).not.toMatch(/function/i);
  });
});
