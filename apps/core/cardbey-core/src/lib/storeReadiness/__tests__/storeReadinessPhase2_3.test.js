/**
 * Store Readiness Phase 2 + 3 tests.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  buildStoreReadinessSnapshot,
  runStoreReadinessRules,
  prioritizeFindings,
  explainOverallScore,
  explainFinding,
  answerFromSnapshot,
  resolveBusinessVertical,
  runVerticalReadinessRules,
  storeReadinessDestinations,
  resolveDestinationLabel,
  DESTINATION_LABELS,
  generateReadinessDraft,
  regenerateReadinessDraft,
  approveReadinessDraft,
  rejectReadinessDraft,
  applyReadinessDraft,
  resetReadinessDraftStoreForTests,
  listDraftApprovalRecords,
  isSellerPilContext,
  toSellerPilContext,
  looksLikeSecretOrPath,
} from '../index.js';

function baseStore(overrides = {}) {
  return {
    id: 'store_p2',
    ownerUserId: 'owner_1',
    name: 'Pho Ngon',
    category: 'restaurant',
    type: 'restaurant',
    description: 'Vietnamese pho.',
    phone: '+61 400 000 000',
    email: 'a@b.com',
    address: '1 Main St',
    hours: { mon: { open: '09:00', close: '17:00' } },
    logoUrl: 'https://cdn.example.com/logo.png',
    heroImageUrl: null,
    heroVideoUrl: null,
    published: true,
    isPublic: true,
    visibility: 'published',
    cta: { label: 'Order now', destination: '/menu' },
    hasEnquiryPath: true,
    notificationEmail: 'a@b.com',
    tagline: 'Warm bowls',
    products: [
      {
        id: '12',
        name: 'Beef Pho',
        price: 16,
        description: 'Broth',
        imageUrl: 'https://cdn.example.com/p.jpg',
        category: 'Noodles',
        isPublished: true,
      },
    ],
    ...overrides,
  };
}

describe('Phase 2 evidence', () => {
  it('exposes structured evidence on hero finding', () => {
    const findings = runStoreReadinessRules(baseStore());
    const hero = findings.find((f) => f.code === 'BRANDING_MISSING_HERO');
    expect(hero).toBeTruthy();
    expect(hero.evidence).toMatchObject({
      heroCount: 0,
      approvedHero: false,
    });
    expect(hero.reason).toMatch(/approved hero/i);
    expect(hero.recommendation).toMatch(/Upload/i);
    expect(Array.isArray(hero.evidenceLines)).toBe(true);
  });
});

describe('Phase 2 explanation API', () => {
  it('explains overall → section → finding → evidence → action', () => {
    const snapshot = buildStoreReadinessSnapshot(baseStore());
    const overall = explainOverallScore(snapshot);
    expect(overall.kind).toBe('readiness_explanation');
    expect(overall.overallScore).toBe(snapshot.overallScore);
    expect(overall.sections.length).toBeGreaterThan(0);
    expect(overall.grounding).toBe('StoreReadinessSnapshot');

    const hero = snapshot.findings.find((f) => f.code === 'BRANDING_MISSING_HERO');
    const explained = explainFinding(snapshot, hero.code);
    expect(explained.ok).toBe(true);
    expect(explained.finding.evidence).toBeTruthy();
    expect(explained.suggestedAction).toBeTruthy();
    expect(explained.narrative).toMatch(/Evidence/);
  });

  it('grounds seller questions on the snapshot only', () => {
    const snapshot = buildStoreReadinessSnapshot(baseStore());
    const why = answerFromSnapshot(snapshot, 'Why is my readiness only 74%?');
    expect(why.grounding).toContain('StoreReadinessSnapshot');
    expect(why.answer).toMatch(/readiness/i);

    const first = answerFromSnapshot(snapshot, 'What should I fix first?');
    expect(first.primaryAction || first.answer).toBeTruthy();

    const hero = answerFromSnapshot(snapshot, "Why isn't my hero passing?");
    expect(hero.answer.toLowerCase()).toMatch(/hero/);

    const products = answerFromSnapshot(snapshot, 'Which products need attention?');
    expect(products.grounding).toContain('StoreReadinessSnapshot');
  });
});

describe('Phase 2 business-specific rules', () => {
  it('resolves verticals and emits restaurant rules', () => {
    expect(resolveBusinessVertical('restaurant')).toBe('restaurant');
    expect(resolveBusinessVertical('retail boutique')).toBe('retail');
    expect(resolveBusinessVertical('handyman service')).toBe('service');
    expect(resolveBusinessVertical('creator portfolio')).toBe('creator');

    const findings = runVerticalReadinessRules(
      baseStore({
        products: [
          {
            id: '1',
            name: 'Pho',
            price: 10,
            description: 'x',
            imageUrl: 'https://cdn.example.com/a.jpg',
            isPublished: true,
          },
        ],
      }),
    );
    expect(findings.some((f) => f.code === 'VERTICAL_RESTAURANT_MENU_COVERAGE')).toBe(true);
  });

  it('emits service quote path finding', () => {
    const findings = runVerticalReadinessRules(
      baseStore({
        type: 'service',
        category: 'handyman',
        hasQuotePath: false,
        hasBookingPath: false,
        transactionMode: 'order',
        products: [
          {
            id: 's1',
            name: 'Repair',
            price: 50,
            description: 'Short',
            imageUrl: 'https://cdn.example.com/a.jpg',
            isPublished: true,
          },
        ],
      }),
    );
    expect(findings.some((f) => f.code === 'VERTICAL_SERVICE_QUOTE_PATH')).toBe(true);
  });
});

describe('Phase 2 prioritization + impact', () => {
  it('includes estimated impact and effort on actions', () => {
    const snapshot = buildStoreReadinessSnapshot(baseStore());
    expect(snapshot.primaryActions.length).toBeLessThanOrEqual(3);
    for (const a of snapshot.primaryActions) {
      expect(typeof a.estimatedImpactPercent).toBe('number');
      expect(typeof a.estimatedEffortMinutes).toBe('number');
      expect(a.destinationLabel).toBeTruthy();
    }
  });

  it('ranks higher impact journey fixes first', () => {
    const findings = runStoreReadinessRules(
      baseStore({
        published: false,
        visibility: 'hidden',
        isPublic: false,
        tagline: '',
      }),
    );
    const { primaryActions } = prioritizeFindings(findings, { maxPrimary: 3 });
    expect(primaryActions[0].findingCode).toBe('STOREFRONT_HIDDEN');
  });
});

describe('Phase 2 deep-link routing', () => {
  it('labels destinations for Studio navigation', () => {
    const dest = storeReadinessDestinations('store_p2', 'draft_1');
    expect(dest.heroImages).toContain('#branding');
    expect(dest.ctaSettings).toContain('focus=cta');
    expect(dest.catalogFilterIncomplete).toContain('filter=incomplete');
    expect(DESTINATION_LABELS.heroImages).toBe('Open Hero Images');
    expect(DESTINATION_LABELS.ctaSettings).toBe('Open CTA Settings');
    expect(DESTINATION_LABELS.businessProfile).toBe('Open Business Profile');
    expect(
      resolveDestinationLabel({
        destinationKey: 'catalogProduct',
        affectedObject: { id: '12', label: '12' },
      }),
    ).toMatch(/Product #12/);
  });
});

describe('Phase 2 seller grounding / no consumer leakage', () => {
  it('seller context stays isolated and secret-free', () => {
    const snapshot = buildStoreReadinessSnapshot(baseStore());
    const seller = toSellerPilContext(snapshot);
    expect(isSellerPilContext(seller)).toBe(true);
    expect(seller.grounding.allowsArbitraryDbQuery).toBe(false);
    expect(seller.version).toBe(2);
    const consumer = { kind: 'visitor_storefront' };
    expect(isSellerPilContext(consumer)).toBe(false);
    expect(JSON.stringify(seller)).not.toMatch(/password|Bearer |C:\\\\Users/i);
  });
});

describe('Phase 3 governed drafts', () => {
  beforeEach(() => {
    resetReadinessDraftStoreForTests();
  });

  it('creates draft, rejects without apply, regenerates', () => {
    const snapshot = buildStoreReadinessSnapshot(baseStore({ description: '' }));
    const draft = generateReadinessDraft({
      snapshot,
      findingCode: 'PROFILE_MISSING_DESCRIPTION',
      generatedBy: 'seller_assistant',
      studioMeta: { storeName: 'Pho Ngon', category: 'restaurant' },
    });
    expect(draft.status).toBe('draft');
    expect(draft.draftType).toBe('business_description');
    expect(draft.content.text).toBeTruthy();

    const rejected = rejectReadinessDraft(draft.id, { ownerUserId: 'owner_1' });
    expect(rejected.ok).toBe(true);
    expect(rejected.draft.status).toBe('rejected');

    const again = generateReadinessDraft({
      snapshot,
      draftType: 'hero_headline',
      studioMeta: { storeName: 'Pho Ngon' },
    });
    const regen = regenerateReadinessDraft(again.id, snapshot, { storeName: 'Pho Ngon' });
    expect(regen.generation).toBeGreaterThanOrEqual(2);
    expect(regen.status).toBe('draft');
  });

  it('requires approval before apply and records governance', async () => {
    const snapshot = buildStoreReadinessSnapshot(baseStore({ description: '' }));
    const draft = generateReadinessDraft({
      snapshot,
      draftType: 'business_description',
      studioMeta: { storeName: 'Pho Ngon' },
    });

    const prisma = {
      business: {
        findUnique: async () => ({ id: 'store_p2', userId: 'owner_1', storefrontSettings: {} }),
        update: async () => ({}),
      },
      product: { update: async () => ({}) },
    };

    const blocked = await applyReadinessDraft(prisma, draft.id, { ownerUserId: 'owner_1' });
    expect(blocked.ok).toBe(false);
    expect(blocked.error).toBe('approval_required');

    const approved = approveReadinessDraft(draft.id, { ownerUserId: 'owner_1' });
    expect(approved.ok).toBe(true);

    const applied = await applyReadinessDraft(prisma, draft.id, { ownerUserId: 'owner_1' });
    expect(applied.ok).toBe(true);
    expect(applied.mutation.published).toBe(false);
    expect(applied.draft.status).toBe('applied');

    const audit = listDraftApprovalRecords('store_p2');
    expect(audit.some((r) => r.action === 'approved')).toBe(true);
    expect(audit.some((r) => r.action === 'applied')).toBe(true);
  });

  it('enforces owner permission on approve', () => {
    const snapshot = buildStoreReadinessSnapshot(baseStore());
    const draft = generateReadinessDraft({ snapshot, draftType: 'cta_text' });
    const res = approveReadinessDraft(draft.id, { ownerUserId: 'intruder' });
    expect(res.ok).toBe(false);
    expect(res.error).toBe('forbidden');
  });
});

describe('Phase 2 sanitize evidence object', () => {
  it('strips secrets from structured evidence via rebuild', async () => {
    const { sanitizeStoreReadinessSnapshot } = await import('../sanitize.js');
    const snapshot = buildStoreReadinessSnapshot(baseStore({ name: '' }));
    snapshot.findings[0].evidence = {
      ok: true,
      token: 'Bearer abc.def.ghi.extra',
      path: 'C:\\Users\\secret\\keys\\token.json',
    };
    snapshot.findings[0].evidenceLines = [
      'Bearer abc.def.ghi.extra',
      'C:\\Users\\secret\\keys\\token.json',
      'name empty',
    ];
    const clean = sanitizeStoreReadinessSnapshot(snapshot);
    const blob = JSON.stringify(clean.findings[0].evidence);
    expect(blob).not.toMatch(/Bearer /);
    expect(blob).not.toMatch(/C:\\\\Users/);
    expect(clean.findings[0].evidenceLines.some((e) => looksLikeSecretOrPath(e))).toBe(false);
  });
});
