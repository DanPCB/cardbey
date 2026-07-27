import { describe, expect, it } from 'vitest';
import {
  resolveStoreCommercePresentation,
  storeMatchesFeedCategory,
  inferServiceSignalsFromItems,
} from '../resolveStoreCommercePresentation.js';

describe('resolveStoreCommercePresentation', () => {
  it('includes legacy nails store without BusinessProfile on services marketplace', () => {
    const resolved = resolveStoreCommercePresentation({
      id: 'legacy-nails',
      name: 'Luxe Nails & Spa',
      type: 'Sports',
      businessCategory: 'nails spa',
      transactionMode: 'order',
    });
    expect(resolved.businessType).toBe('service_fixed_booking');
    expect(resolved.includedInServices).toBe(true);
    expect(storeMatchesFeedCategory({ name: 'Luxe Nails & Spa', type: 'Sports' }, 'services')).toBe(true);
  });

  it('includes store with item.serviceCatalog.serviceMode fixed_booking', () => {
    const items = [
      {
        itemType: 'service',
        serviceCatalog: { serviceMode: 'fixed_booking', executionAction: 'book' },
      },
    ];
    const resolved = resolveStoreCommercePresentation({ id: 's1', name: 'Studio', type: 'general' }, items);
    expect(resolved.hasBookableServices).toBe(true);
    expect(resolved.includedInServices).toBe(true);
    expect(storeMatchesFeedCategory({ id: 's1', type: 'general' }, 'services', items)).toBe(true);
  });

  it('includes store with item.serviceCatalog.serviceMode quote_required', () => {
    const items = [
      {
        itemType: 'service',
        serviceCatalog: { serviceMode: 'quote_required', executionAction: 'request_quote' },
      },
    ];
    const resolved = resolveStoreCommercePresentation({ id: 's2', name: 'Trade Co', type: 'general' }, items);
    expect(resolved.hasQuoteServices).toBe(true);
    expect(resolved.businessType).toBe('service_quote_required');
    expect(resolved.includedInServices).toBe(true);
  });

  it('includes store with category nails spa keywords', () => {
    const resolved = resolveStoreCommercePresentation({
      name: 'Harbour Nails Spa',
      category: 'nails spa',
    });
    expect(resolved.businessType).toBe('service_fixed_booking');
    expect(resolved.includedInServices).toBe(true);
  });

  it('includes store with category tiling flooring keywords', () => {
    const resolved = resolveStoreCommercePresentation({
      name: 'Melbourne Flooring',
      category: 'tiling flooring',
      type: 'Sports',
    });
    expect(resolved.businessType).toBe('service_quote_required');
    expect(resolved.includedInServices).toBe(true);
    expect(storeMatchesFeedCategory({ name: 'Melbourne Flooring', type: 'Sports' }, 'services')).toBe(true);
  });

  it('excludes retail product store from services marketplace', () => {
    const resolved = resolveStoreCommercePresentation({
      name: 'Studio Lumen Boutique',
      type: 'retail',
      description: 'Clothing and homewares shop',
    });
    expect(resolved.includedInServices).toBe(false);
    expect(storeMatchesFeedCategory({ name: 'Studio Lumen Boutique', type: 'retail' }, 'services')).toBe(false);
  });

  it('routes restaurant to food lane not services', () => {
    const resolved = resolveStoreCommercePresentation({
      name: 'Saigon Kitchen',
      type: 'restaurant',
    });
    expect(resolved.businessType).toBe('food_menu');
    expect(resolved.includedInFood).toBe(true);
    expect(resolved.includedInServices).toBe(false);
    expect(storeMatchesFeedCategory({ name: 'Saigon Kitchen', type: 'restaurant' }, 'food')).toBe(true);
    expect(storeMatchesFeedCategory({ name: 'Saigon Kitchen', type: 'restaurant' }, 'services')).toBe(false);
  });

  it('infers service signals from executionAction book and request_quote', () => {
    expect(inferServiceSignalsFromItems([{ primaryAction: 'book', itemType: 'service' }])).toMatchObject({
      hasBookableServices: true,
      hasServices: true,
    });
    expect(
      inferServiceSignalsFromItems([{ primaryAction: 'request_quote', itemType: 'service' }]),
    ).toMatchObject({
      hasQuoteServices: true,
      hasServices: true,
    });
  });
});
