import { describe, expect, it, afterEach } from 'vitest';
import {
  gatherCommerceEvidence,
  inferBusinessModel,
  resolveCtaDecision,
  resolveDesignLibraryCommercePolicy,
  applyDesignLibraryCommercePolicy,
  CTA_POLICY_VERSION,
  BUSINESS_MODEL_POLICY_VERSION,
} from '../index.js';
import { isDesignLibraryAuthoritative } from '../../flags.js';
import { MODERN_SECURITY_DOORS_NAV_FIXTURE } from '../../classification/__fixtures__/modernSecurityDoorsNav.js';
import { classifyResearchCatalogProducts } from '../../classification/classifyResearchCatalog.js';
import { finalizeResearchCatalogForDraft } from '../../../../services/draftStore/researchCatalogDraft.js';

describe('commerce evidence + business model', () => {
  it('MSD-like classified nav → service_quote with high confidence', () => {
    const classified = classifyResearchCatalogProducts(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { force: true },
    );
    const evidence = gatherCommerceEvidence(classified.products, {
      phone: '03 9000 0000',
    });
    expect(evidence.serviceCategoryCount).toBeGreaterThanOrEqual(2);
    expect(evidence.hasQuoteSignal).toBe(true);
    expect(evidence.hasBookingUrl).toBe(false);
    expect(evidence.hasPricedPurchasableProduct).toBe(false);

    const model = inferBusinessModel(evidence);
    expect(model.businessModel).toBe('service_quote');
    expect(model.confidence).toBeGreaterThanOrEqual(0.85);
    expect(model.policyVersion).toBe(BUSINESS_MODEL_POLICY_VERSION);
  });

  it('booking URL → service_booking', () => {
    const evidence = gatherCommerceEvidence(
      [{ name: 'Haircut', contentRole: 'service', price: 45 }],
      { bookingUrl: 'https://book.fresha.com/salon' },
    );
    expect(inferBusinessModel(evidence).businessModel).toBe('service_booking');
  });

  it('priced purchasable product → retail', () => {
    const evidence = gatherCommerceEvidence([
      {
        name: 'Widget',
        contentRole: 'product',
        price: 29,
        purchaseEnabled: true,
        sku: 'W-1',
      },
    ]);
    expect(inferBusinessModel(evidence).businessModel).toBe('retail');
  });

  it('menu roles → restaurant', () => {
    const evidence = gatherCommerceEvidence([
      { name: 'Pad Thai', contentRole: 'menu_item', price: 18 },
    ]);
    expect(inferBusinessModel(evidence).businessModel).toBe('restaurant');
  });
});

describe('CTA decision policy', () => {
  it('MSD quote + phone → Request a quote + Call now', () => {
    const classified = classifyResearchCatalogProducts(
      MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({ name, url, type })),
      { force: true },
    );
    const policy = resolveDesignLibraryCommercePolicy(classified.products, {
      phone: '03 9000 0000',
    });
    expect(policy.businessModel.businessModel).toBe('service_quote');
    expect(policy.cta.primary.action).toBe('request_quote');
    expect(policy.cta.primary.label).toBe('Request a quote');
    expect(policy.cta.secondary?.action).toBe('call');
    expect(policy.cta.secondary?.label).toBe('Call now');
    expect(policy.cta.policyVersion).toBe(CTA_POLICY_VERSION);
  });

  it('booking evidence → Book (never invent without URL/provider)', () => {
    const withBooking = resolveCtaDecision(
      'service_booking',
      gatherCommerceEvidence([{ name: 'Cut', contentRole: 'service' }], {
        bookingUrl: 'https://calendly.com/x',
        phone: '0400000000',
      }),
    );
    expect(withBooking.primary.action).toBe('book');
    expect(withBooking.primary.label).toBe('Book');
    expect(withBooking.secondary?.action).toBe('call');

    const without = resolveCtaDecision(
      'service_booking',
      gatherCommerceEvidence([{ name: 'Cut', contentRole: 'service' }], { phone: '0400000000' }),
    );
    expect(without.primary.action).not.toBe('book');
    expect(without.reasons).toContain('service_booking_without_provider');
  });

  it('retail purchasable → Buy + Add to cart', () => {
    const cta = resolveCtaDecision(
      'retail',
      gatherCommerceEvidence([
        {
          name: 'Widget',
          contentRole: 'product',
          price: 29,
          purchaseEnabled: true,
          sku: 'W-1',
        },
      ]),
    );
    expect(cta.primary.action).toBe('buy');
    expect(cta.secondary?.action).toBe('add_to_cart');
  });

  it('restaurant delivery → Order; reservation → Reserve', () => {
    const order = resolveCtaDecision(
      'restaurant',
      gatherCommerceEvidence([{ name: 'Burger', contentRole: 'menu_item', price: 14 }], {
        deliveryUrl: 'https://ubereats.com/x',
        phone: '0399999999',
      }),
    );
    expect(order.primary.action).toBe('order');
    expect(order.primary.label).toBe('Order now');

    const reserve = resolveCtaDecision(
      'restaurant',
      gatherCommerceEvidence([{ name: 'Burger', contentRole: 'menu_item', price: 14 }], {
        reservationUrl: 'https://opentable.com/x',
        phone: '0399999999',
      }),
    );
    expect(reserve.primary.action).toBe('reserve');
    expect(reserve.primary.label).toBe('Reserve table');
  });

  it('never promotes Buy without priced purchasable evidence', () => {
    const cta = resolveCtaDecision('retail', gatherCommerceEvidence([
      { name: 'Catalogue', contentRole: 'product_category' },
    ]));
    expect(cta.primary.action).not.toBe('buy');
    expect(cta.primary.action).not.toBe('add_to_cart');
  });
});

describe('applyDesignLibraryCommercePolicy wiring', () => {
  const prev = process.env.ENABLE_DESIGN_LIBRARY_V1;

  afterEach(() => {
    if (prev === undefined) delete process.env.ENABLE_DESIGN_LIBRARY_V1;
    else process.env.ENABLE_DESIGN_LIBRARY_V1 = prev;
  });

  it('flag off → no meta attached', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'false';
    const { catalog, attached } = applyDesignLibraryCommercePolicy({
      products: [{ name: 'Roller Shutters', contentRole: 'service_category' }],
    });
    expect(attached).toBe(false);
    expect(catalog.meta?.designLibraryCommercePolicy).toBeUndefined();
  });

  it('flag on → advisory meta; authority stays false', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    expect(isDesignLibraryAuthoritative()).toBe(false);

    const { catalog, attached, policy } = applyDesignLibraryCommercePolicy(
      {
        products: MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type, expectedRole }) => ({
          name,
          url,
          type,
          contentRole: expectedRole,
        })),
      },
      { phone: '03 9000 0000' },
    );
    expect(attached).toBe(true);
    expect(policy.businessModel.businessModel).toBe('service_quote');
    expect(catalog.meta.designLibraryCommercePolicy).toMatchObject({
      authoritative: false,
      businessModel: 'service_quote',
      primaryAction: 'request_quote',
      primaryLabel: 'Request a quote',
      secondaryAction: 'call',
    });
  });

  it('finalizeResearchCatalogForDraft attaches commerce policy when flag on', () => {
    process.env.ENABLE_DESIGN_LIBRARY_V1 = 'true';
    const finalized = finalizeResearchCatalogForDraft(
      {
        products: MODERN_SECURITY_DOORS_NAV_FIXTURE.map(({ name, url, type }) => ({
          name,
          url,
          type,
          priceWasNotExplicitlyProvided: true,
          price: null,
        })),
        profile: { name: 'Modern Security Doors' },
      },
      {
        confidence: 0.9,
        businessProfile: {
          businessType: 'service_quote_required',
          catalogMode: 'services',
          presentation: { primaryCTA: 'Book' },
        },
        facts: { phone: '03 9000 0000' },
        ownerConfirmed: true,
      },
      { businessName: 'Modern Security Doors' },
    );

    // Live BSL presentation may still say Book — design library policy is advisory only.
    expect(finalized.meta.primaryCTA).toBe('Book');
    expect(finalized.meta.designLibraryCommercePolicy).toMatchObject({
      authoritative: false,
      businessModel: 'service_quote',
      primaryAction: 'request_quote',
      secondaryAction: 'call',
    });
    // Enrich may stamp book on items; policy must not flip live fields.
    expect(finalized.meta.designLibraryCommercePolicy.primaryAction).not.toBe('book');
  });
});
