/**
 * Store Readiness V1 — unit tests (deterministic rules, prioritize, sanitize, ownership).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  buildStoreReadinessSnapshot,
  runStoreReadinessRules,
  prioritizeFindings,
  sanitizeStoreReadinessSnapshot,
  toSellerPilContext,
  isSellerPilContext,
  looksLikeSecretOrPath,
  assertStoreOwner,
  storeReadinessDestinations,
  isStoreReadinessV1Enabled,
  isPilSellerAssistantV1Enabled,
} from '../index.js';

function baseCompleteStore(overrides = {}) {
  return {
    id: 'store_complete',
    ownerUserId: 'owner_1',
    name: 'Pho Ngon Braybrook',
    category: 'restaurant',
    type: 'restaurant',
    description: 'Vietnamese pho and banh mi in Braybrook.',
    phone: '+61 400 000 000',
    email: 'hello@phongon.example',
    address: '1 Main St, Braybrook VIC',
    hours: { mon: { open: '09:00', close: '17:00' } },
    logoUrl: 'https://cdn.example.com/logo.png',
    heroImageUrl: 'https://cdn.example.com/hero.jpg',
    published: true,
    isPublic: true,
    visibility: 'published',
    cta: { label: 'Order now', destination: '/menu' },
    hasEnquiryPath: true,
    notificationEmail: 'hello@phongon.example',
    tagline: 'Warm bowls, fast service',
    products: [
      {
        id: 'p1',
        name: 'Beef Pho',
        price: 16.5,
        description: 'Slow-cooked broth with rare beef',
        imageUrl: 'https://cdn.example.com/pho.jpg',
        category: 'Noodles',
        isPublished: true,
      },
      {
        id: 'p2',
        name: 'Pork Banh Mi',
        price: 9.5,
        description: 'Crispy baguette with pickled veg',
        imageUrl: 'https://cdn.example.com/banhmi.jpg',
        category: 'Sandwiches',
        isPublished: true,
      },
    ],
    ...overrides,
  };
}

describe('feature flags', () => {
  const prevReadiness = process.env.ENABLE_STORE_READINESS_V1;
  const prevPil = process.env.ENABLE_PIL_SELLER_ASSISTANT_V1;

  afterEach(() => {
    if (prevReadiness === undefined) delete process.env.ENABLE_STORE_READINESS_V1;
    else process.env.ENABLE_STORE_READINESS_V1 = prevReadiness;
    if (prevPil === undefined) delete process.env.ENABLE_PIL_SELLER_ASSISTANT_V1;
    else process.env.ENABLE_PIL_SELLER_ASSISTANT_V1 = prevPil;
  });

  it('preserves off-by-default experience when flags disabled', () => {
    delete process.env.ENABLE_STORE_READINESS_V1;
    delete process.env.ENABLE_PIL_SELLER_ASSISTANT_V1;
    expect(isStoreReadinessV1Enabled()).toBe(false);
    expect(isPilSellerAssistantV1Enabled()).toBe(false);
  });

  it('requires readiness flag before seller assistant', () => {
    process.env.ENABLE_STORE_READINESS_V1 = '0';
    process.env.ENABLE_PIL_SELLER_ASSISTANT_V1 = '1';
    expect(isPilSellerAssistantV1Enabled()).toBe(false);
  });

  it('enables seller assistant when both flags on', () => {
    process.env.ENABLE_STORE_READINESS_V1 = '1';
    process.env.ENABLE_PIL_SELLER_ASSISTANT_V1 = '1';
    expect(isStoreReadinessV1Enabled()).toBe(true);
    expect(isPilSellerAssistantV1Enabled()).toBe(true);
  });
});

describe('assertStoreOwner', () => {
  it('allows the owner to access their store', async () => {
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: 's1', userId: 'u1' }),
      },
    };
    const result = await assertStoreOwner(prisma, 's1', 'u1');
    expect(result.ok).toBe(true);
  });

  it('forbids non-owners from another store', async () => {
    const prisma = {
      business: {
        findUnique: vi.fn().mockResolvedValue({ id: 's1', userId: 'owner' }),
      },
    };
    const result = await assertStoreOwner(prisma, 's1', 'intruder');
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('forbidden');
  });
});

describe('deterministic readiness rules', () => {
  it('incomplete business profile produces findings', () => {
    const findings = runStoreReadinessRules({
      id: 's1',
      name: '',
      description: '',
      phone: '',
      email: '',
      address: '',
      products: [],
    });
    const codes = findings.map((f) => f.code);
    expect(codes).toContain('PROFILE_MISSING_NAME');
    expect(codes).toContain('PROFILE_MISSING_DESCRIPTION');
    expect(codes).toContain('PROFILE_MISSING_CONTACT');
    expect(codes).toContain('PROFILE_MISSING_LOCATION');
  });

  it('detects missing product prices', () => {
    const findings = runStoreReadinessRules(
      baseCompleteStore({
        products: [
          {
            id: 'p1',
            name: 'Pho',
            price: null,
            description: 'Soup',
            imageUrl: 'https://cdn.example.com/a.jpg',
            category: 'Noodles',
            isPublished: true,
          },
        ],
      }),
    );
    expect(findings.some((f) => f.code === 'CATALOG_MISSING_PRICE')).toBe(true);
  });

  it('detects missing product images', () => {
    const findings = runStoreReadinessRules(
      baseCompleteStore({
        products: [
          {
            id: 'p1',
            name: 'Pho',
            price: 12,
            description: 'Soup',
            imageUrl: '',
            category: 'Noodles',
            isPublished: true,
          },
        ],
      }),
    );
    expect(findings.some((f) => f.code === 'CATALOG_MISSING_IMAGE')).toBe(true);
  });

  it('detects invalid or failed hero media', () => {
    const findings = runStoreReadinessRules(
      baseCompleteStore({
        heroImageUrl: null,
        heroVideoUrl: 'https://cdn.example.com/hero.mp4',
        heroVideoPlayable: false,
      }),
    );
    expect(findings.some((f) => f.code === 'BRANDING_HERO_VIDEO_NOT_PLAYABLE')).toBe(true);
  });

  it('identifies a hidden store', () => {
    const findings = runStoreReadinessRules(
      baseCompleteStore({
        published: false,
        isPublic: false,
        visibility: 'hidden',
      }),
    );
    expect(findings.some((f) => f.code === 'STOREFRONT_HIDDEN')).toBe(true);
  });

  it('identifies a missing CTA', () => {
    const findings = runStoreReadinessRules(
      baseCompleteStore({
        cta: null,
        ctaLabel: '',
        ctaUrl: '',
      }),
    );
    expect(findings.some((f) => f.code === 'STOREFRONT_MISSING_CTA')).toBe(true);
  });

  it('complete store receives a ready (or nearly ready) state', () => {
    const snapshot = buildStoreReadinessSnapshot(baseCompleteStore());
    expect(snapshot.primaryActions.length).toBeLessThanOrEqual(3);
    expect(['ready', 'nearly_ready']).toContain(snapshot.status);
    expect(snapshot.overallScore).toBeGreaterThanOrEqual(80);
    expect(snapshot.findings.every((f) => f.severity !== 'critical')).toBe(true);
  });
});

describe('prioritization', () => {
  it('returns at most three primary recommendations', () => {
    const findings = runStoreReadinessRules({
      id: 's1',
      name: '',
      description: '',
      phone: '',
      email: '',
      address: '',
      published: false,
      visibility: 'hidden',
      products: [],
      heroVideoUrl: 'https://cdn.example.com/x.mp4',
      heroVideoPlayable: false,
    });
    const { primaryActions, recommendedActions } = prioritizeFindings(findings, { maxPrimary: 3 });
    expect(primaryActions.length).toBeLessThanOrEqual(3);
    expect(recommendedActions.length).toBeGreaterThanOrEqual(primaryActions.length);
  });

  it('prioritizes broken journeys and hidden store above marketing', () => {
    const findings = runStoreReadinessRules(
      baseCompleteStore({
        published: false,
        isPublic: false,
        visibility: 'hidden',
        tagline: '',
        slogan: '',
        products: [
          {
            id: 'p1',
            name: 'Pho',
            price: null,
            description: 'Soup',
            imageUrl: 'https://cdn.example.com/a.jpg',
            category: 'Noodles',
            isPublished: true,
          },
        ],
      }),
    );
    const { primaryActions, recommendedActions } = prioritizeFindings(findings, { maxPrimary: 3 });
    const codes = primaryActions.map((a) => a.findingCode);
    expect(codes[0]).toBe('STOREFRONT_HIDDEN');
    expect(codes).toContain('CATALOG_MISSING_PRICE');
    const hiddenPri = recommendedActions.find((a) => a.findingCode === 'STOREFRONT_HIDDEN')?.priority ?? 0;
    const marketingPri =
      recommendedActions.find((a) => a.findingCode === 'MARKETING_MISSING_TAGLINE')?.priority ?? 0;
    expect(hiddenPri).toBeGreaterThan(marketingPri);
  });
});

describe('seller-safe sanitization and PIL context', () => {
  it('strips credentials and internal file paths from evidence', () => {
    const dirty = buildStoreReadinessSnapshot(baseCompleteStore({ name: '' }));
    dirty.findings[0].evidenceLines = [
      ...(dirty.findings[0].evidenceLines || []),
      'Bearer abc.def.ghi',
      'C:\\Users\\secret\\keys\\token.json',
      'password=supersecretvalue123456',
    ];
    dirty.findings[0].evidence = {
      ...(typeof dirty.findings[0].evidence === 'object' ? dirty.findings[0].evidence : {}),
      leak: 'Bearer abc.def.ghi',
    };
    const clean = sanitizeStoreReadinessSnapshot(dirty);
    const allEvidence = clean.findings.flatMap((f) => f.evidenceLines || []);
    expect(allEvidence.some((e) => looksLikeSecretOrPath(e))).toBe(false);
    expect(JSON.stringify(clean)).not.toMatch(/Bearer /);
    expect(JSON.stringify(clean)).not.toMatch(/C:\\Users/);
  });

  it('seller context contains no credentials or internal file paths', () => {
    const snapshot = buildStoreReadinessSnapshot(baseCompleteStore({ name: '' }));
    const ctx = toSellerPilContext(snapshot);
    expect(ctx.kind).toBe('seller_store_readiness');
    expect(ctx.allowedAssistance.publishListings).toBe(false);
    expect(ctx.allowedAssistance.changePrices).toBe(false);
    expect(ctx.topRecommendedActions.length).toBeLessThanOrEqual(3);
    const blob = JSON.stringify(ctx);
    expect(blob).not.toMatch(/password|api_key|private_key|Bearer /i);
    expect(blob).not.toMatch(/C:\\Users|file:\/\//);
  });

  it('consumer PIL does not receive seller-private context via shared helper', () => {
    const consumerCtx = { kind: 'visitor_storefront', storeId: 's1' };
    const sellerCtx = toSellerPilContext(buildStoreReadinessSnapshot(baseCompleteStore({ name: '' })));
    expect(isSellerPilContext(consumerCtx)).toBe(false);
    expect(isSellerPilContext(sellerCtx)).toBe(true);
    expect(consumerCtx).not.toHaveProperty('allowedAssistance');
    expect(consumerCtx).not.toHaveProperty('topFindings');
  });
});

describe('navigation destinations', () => {
  it('points to valid Business Studio destinations', () => {
    const dest = storeReadinessDestinations('store_abc', 'draft_1');
    expect(dest.businessProfile).toContain('/app/store/draft/review');
    expect(dest.catalog).toContain('#catalog');
    expect(dest.overview).toContain('storeId=store_abc');
    const snapshot = buildStoreReadinessSnapshot(
      baseCompleteStore({ id: 'store_abc', draftId: 'draft_1', name: '' }),
    );
    for (const action of snapshot.primaryActions) {
      expect(action.destination).toBeTruthy();
      expect(String(action.destination)).toMatch(/^\/(app|business)\//);
    }
  });
});

describe('buildStoreReadinessSnapshot shape', () => {
  it('returns canonical DTO sections', () => {
    const snapshot = buildStoreReadinessSnapshot(baseCompleteStore({ name: '' }));
    expect(snapshot.storeId).toBe('store_complete');
    expect(snapshot.ownerUserId).toBe('owner_1');
    expect(snapshot.sections).toHaveProperty('businessProfile');
    expect(snapshot.sections).toHaveProperty('catalog');
    expect(snapshot.sections).toHaveProperty('storefront');
    expect(Array.isArray(snapshot.findings)).toBe(true);
    expect(Array.isArray(snapshot.recommendedActions)).toBe(true);
    expect(snapshot.primaryActions.length).toBeLessThanOrEqual(3);
  });
});
