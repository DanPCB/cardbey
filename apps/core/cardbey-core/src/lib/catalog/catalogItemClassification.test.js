import { describe, expect, it } from 'vitest';
import {
  enrichPublicCatalogItem,
  inferCatalogSectionLabel,
  isServiceBusinessContext,
  normalizeCatalogItem,
  resolveItemActionVisibility,
} from './catalogItemClassification.js';
import { resolveItemCommerceMode } from '../storeTransactionMode.js';

describe('catalogItemClassification', () => {
  it('classifies AA Travel & Golf Tour as service booking packages', () => {
    const ctx = { businessType: 'General', businessName: 'AA Travel & Golf Tour' };
    expect(isServiceBusinessContext({ type: 'General', name: 'AA Travel & Golf Tour' })).toBe(true);
    expect(inferCatalogSectionLabel('General', 'booking', 'AA Travel & Golf Tour')).toBe('Packages');
    expect(inferCatalogSectionLabel('travel agency', 'booking')).toBe('Packages');

    const item = normalizeCatalogItem({ name: 'Golf Day Trip' }, ctx);
    expect(item.itemType).toBe('package');
    expect(item.bookingEnabled).toBe(true);
    expect(item.purchaseEnabled).toBe(false);
    expect(item.primaryAction).toBe('book');
    expect(resolveItemActionVisibility(item).showBook).toBe(true);
    expect(resolveItemActionVisibility(item).showCart).toBe(false);
  });

  it('service store catalog resolves to book, not add to cart', () => {
    const item = normalizeCatalogItem({ name: 'Manicure' }, { businessType: 'nail salon' });
    expect(item.primaryAction).toBe('book');
    expect(resolveItemCommerceMode(item, 'booking', { businessType: 'nail salon' })).toBe('booking');
  });

  it('product store resolves to add to cart', () => {
    const item = normalizeCatalogItem({ name: 'T-Shirt' }, { businessType: 'retail shop' });
    expect(item.itemType).toBe('product');
    expect(item.primaryAction).toBe('add_to_cart');
    expect(resolveItemCommerceMode(item, 'order', { businessType: 'retail shop' })).toBe('order');
  });

  it('restaurant menu item defaults to add to cart with optional booking', () => {
    const menu = normalizeCatalogItem({ name: 'Pho' }, { businessType: 'restaurant' });
    expect(menu.itemType).toBe('service');
    expect(menu.purchaseEnabled).toBe(true);
    expect(menu.primaryAction).toBe('add_to_cart');

    const withBooking = normalizeCatalogItem(
      { name: 'Table for 2', bookingEnabled: true },
      { businessType: 'restaurant' },
    );
    expect(withBooking.bookingEnabled).toBe(true);
    expect(resolveItemActionVisibility(withBooking).showBook).toBe(true);
  });

  it('mixed catalog supports services and products', () => {
    const service = normalizeCatalogItem({ kind: 'service' }, { businessType: 'nail salon' });
    const product = normalizeCatalogItem({ kind: 'product' }, { businessType: 'nail salon' });
    expect(service.primaryAction).toBe('book');
    expect(product.primaryAction).toBe('add_to_cart');
  });

  it('enrichPublicCatalogItem backfills legacy product rows', () => {
    const enriched = enrichPublicCatalogItem(
      { id: '1', name: 'Tour A', price: 100 },
      { businessType: 'General', businessName: 'AA Travel & Golf Tour' },
    );
    expect(enriched.itemType).toBe('package');
    expect(enriched.primaryAction).toBe('book');
    expect(enriched.kind).toBe('service');
  });
});
