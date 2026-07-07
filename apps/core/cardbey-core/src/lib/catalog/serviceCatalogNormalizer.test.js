import { describe, expect, it } from 'vitest';
import {
  enrichPublicServiceCatalogItem,
  inferServiceMode,
  migrateServiceCatalogItems,
  normalizeServiceCatalogItem,
} from './serviceCatalogNormalizer.js';

describe('serviceCatalogNormalizer', () => {
  it('classifies bathroom tiling as quote_required with from price', () => {
    const item = normalizeServiceCatalogItem(
      { name: 'Bathroom Tiling', price: 35, category: 'Tiling' },
      { businessType: 'tiling contractor', itemType: 'service' },
    );
    expect(item.serviceMode).toBe('quote_required');
    expect(item.executionAction).toBe('request_quote');
    expect(item.fromPrice).toBe(35);
    expect(item.price).toBeUndefined();
  });

  it('classifies haircut as fixed_booking with exact price', () => {
    const item = normalizeServiceCatalogItem(
      { name: 'Classic Haircut', price: 35, durationMinutes: 30 },
      { businessType: 'hair salon', itemType: 'service' },
    );
    expect(item.serviceMode).toBe('fixed_booking');
    expect(item.executionAction).toBe('book');
    expect(item.price).toBe(35);
    expect(item.durationMinutes).toBe(30);
  });

  it('classifies on-site measurement as fixed_booking', () => {
    const item = normalizeServiceCatalogItem(
      { name: 'On-site Measurement', price: 120, durationMinutes: 60 },
      { businessType: 'flooring', itemType: 'service' },
    );
    expect(item.serviceMode).toBe('fixed_booking');
    expect(item.executionAction).toBe('book');
  });

  it('keeps products on add_to_cart', () => {
    const item = normalizeServiceCatalogItem(
      { name: 'Ceramic Tile Pack', price: 45 },
      { businessType: 'retail shop', itemType: 'product' },
    );
    expect(item.type).toBe('product');
    expect(item.executionAction).toBe('add_to_cart');
  });

  it('migrates legacy product rows for quote-required BSL stores', () => {
    const { items } = migrateServiceCatalogItems(
      [
        {
          id: '1',
          name: 'Residential tiling',
          category: 'Installation Services',
          itemType: 'product',
          primaryAction: 'add_to_cart',
        },
      ],
      {
        businessType: 'Sports',
        canonicalBusinessType: 'service_quote_required',
        businessName: 'AAA Tiles and floor',
        storeId: 'store-tiles',
      },
    );
    expect(items[0].itemType).toBe('service');
    expect(items[0].executionAction).toBe('request_quote');
    expect(items[0].serviceMode).toBe('quote_required');
  });

  it('migrates legacy service rows with logs', () => {
    const { items, upgraded } = migrateServiceCatalogItems(
      [
        { id: '1', name: 'Floor Tiling', price: 40, primaryAction: 'add_to_cart', itemType: 'service' },
        { id: '2', name: 'Manicure', price: 45, itemType: 'service' },
      ],
      { businessType: 'nail salon', storeId: 'store-1' },
    );
    expect(upgraded).toBeGreaterThan(0);
    expect(items[0].executionAction).toBe('request_quote');
    expect(items[0].fromPrice).toBe(40);
    expect(items[1].executionAction).toBe('book');
  });

  it('enrichPublicServiceCatalogItem never shows fake fixed price for quote work', () => {
    const enriched = enrichPublicServiceCatalogItem(
      { id: '1', name: 'Bathroom Renovation', price: 5000, itemType: 'service' },
      { businessType: 'renovation' },
    );
    expect(enriched.executionAction).toBe('request_quote');
    expect(enriched.price).toBeNull();
    expect(enriched.fromPrice).toBe(5000);
  });
});

describe('inferServiceMode', () => {
  it('detects flooring from business name', () => {
    expect(
      inferServiceMode({ name: 'Standard Service' }, { businessName: 'Melbourne Flooring' }),
    ).toBe('quote_required');
  });
});
