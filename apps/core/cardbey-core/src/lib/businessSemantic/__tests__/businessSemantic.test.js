import { describe, expect, it } from 'vitest';
import { buildBusinessProfile } from '../BusinessProfileBuilder.js';
import { profileHasCapability } from '../BusinessProfileRepository.js';
import { getBusinessCatalogPresentation, getDashboardWidgetsForStore, getPerformerBusinessContext } from '../index.js';

describe('Business Semantic Layer — acceptance', () => {
  it('retail: products, cart, checkout, inventory', () => {
    const { profile } = buildBusinessProfile({
      businessName: 'Urban Boutique',
      businessType: 'retail clothing shop',
    });
    expect(profile.businessType).toBe('product_retail');
    expect(profile.catalogMode).toBe('products');
    expect(profile.presentation.catalogLabel).toBe('Products');
    expect(profile.presentation.primaryCTA).toBe('Add to cart');
    expect(profileHasCapability(profile, 'cart')).toBe(true);
    expect(profileHasCapability(profile, 'checkout')).toBe(true);
    expect(profileHasCapability(profile, 'inventory')).toBe(true);
    expect(profile.runtimeProfile.orderingEnabled).toBe(false);
    expect(profile.runtimeProfile.bookingEnabled).toBe(false);
    expect(profile.runtimeProfile.quotationEnabled).toBe(false);
  });

  it('salon: services, booking, calendar, appointments', () => {
    const { profile } = buildBusinessProfile({
      businessName: 'Luxe Nails & Spa',
      businessType: 'nail salon',
      description: 'Manicure, pedicure, massage and facial treatments',
    });
    expect(profile.businessType).toBe('service_fixed_booking');
    expect(profile.catalogMode).toBe('services');
    expect(profile.presentation.primaryCTA).toBe('Book');
    expect(profileHasCapability(profile, 'booking')).toBe(true);
    expect(profileHasCapability(profile, 'calendar')).toBe(true);
    expect(profileHasCapability(profile, 'appointments')).toBe(true);
    expect(profileHasCapability(profile, 'quotation')).toBe(false);
    expect(profile.runtimeProfile.bookingEnabled).toBe(true);
    expect(profile.generationProfile.defaultSections).toEqual(
      expect.arrayContaining(['Services', 'Staff']),
    );
  });

  it('tiler: services, quote, projects, inspection booking', () => {
    const { profile } = buildBusinessProfile({
      businessName: 'Melbourne Flooring & Tiling',
      businessType: 'tiling contractor',
    });
    expect(profile.businessType).toBe('service_quote_required');
    expect(profile.catalogMode).toBe('services');
    expect(profile.presentation.primaryCTA).toBe('Request quote');
    expect(profileHasCapability(profile, 'quotation')).toBe(true);
    expect(profileHasCapability(profile, 'projects')).toBe(true);
    expect(profile.runtimeProfile.quotationEnabled).toBe(true);
    expect(profile.runtimeProfile.bookingEnabled).toBe(false);
    expect(profileHasCapability(profile, 'cart')).toBe(false);
    expect(profile.generationProfile.defaultSections).toEqual(
      expect.arrayContaining(['Projects', 'Pricing Guide']),
    );
  });

  it('restaurant: menu, ordering, delivery, reservation', () => {
    const { profile } = buildBusinessProfile({
      businessName: 'Saigon Kitchen',
      businessType: 'restaurant',
    });
    expect(profile.businessType).toBe('food_menu');
    expect(profile.catalogMode).toBe('menu');
    expect(profile.presentation.catalogLabel).toBe('Menu');
    expect(profile.presentation.primaryCTA).toBe('Order');
    expect(profileHasCapability(profile, 'menu')).toBe(true);
    expect(profileHasCapability(profile, 'ordering')).toBe(true);
    expect(profileHasCapability(profile, 'kitchen')).toBe(true);
    expect(profile.runtimeProfile.orderingEnabled).toBe(true);
    expect(profile.generationProfile.defaultSections).toEqual(
      expect.arrayContaining(['Menu', 'Popular', 'Location']),
    );
  });

  it('hybrid: mixed capabilities', () => {
    const { profile } = buildBusinessProfile({
      businessName: 'Style Studio Shop',
      businessType: 'salon and retail shop',
      items: [
        { name: 'Gel Manicure', type: 'service' },
        { name: 'Nail Polish Bottle', type: 'product' },
      ],
    });
    expect(profile.businessType).toBe('hybrid');
    expect(profile.catalogMode).toBe('catalog');
    expect(profileHasCapability(profile, 'cart')).toBe(true);
    expect(profileHasCapability(profile, 'booking')).toBe(true);
    expect(profile.runtimeProfile.bookingEnabled).toBe(true);
    expect(profile.runtimeProfile.orderingEnabled).toBe(false);
  });
});

describe('Business Semantic Layer — downstream resolvers', () => {
  it('presentation uses capabilities not hardcoded business names', () => {
    const presentation = getBusinessCatalogPresentation(
      { name: 'Pro Tiles', type: 'tiling' },
      [{ name: 'Bathroom Tiling', type: 'service' }],
    );
    expect(presentation.showQuoteControls).toBe(true);
    expect(presentation.showBookingControls).toBe(false);
    expect(presentation.showCartControls).toBe(false);
    expect(presentation.primaryCTA).toBe('Request quote');
  });

  it('performer recommendations derive from business profile', () => {
    const ctx = getPerformerBusinessContext({ name: 'Luxe Nails', type: 'nail salon' });
    expect(ctx.recommendations).toEqual(
      expect.arrayContaining(['Increase bookings', 'Fill empty calendar slots']),
    );
    expect(ctx.capabilities.booking).toBe(true);
  });

  it('dashboard widgets derive from business profile', () => {
    const widgets = getDashboardWidgetsForStore({ name: 'Urban Boutique', type: 'retail shop' });
    expect(widgets).toEqual(expect.arrayContaining(['sales', 'orders', 'inventory']));
  });
});
