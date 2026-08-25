/**
 * Phase B acceptance — evidence-backed free Business Snapshot.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  adjustBusinessContext,
  buildBusinessSnapshot,
  confirmBusinessContext,
  continueWithDescription,
  createEmptyBusinessContext,
  createKnowledgeItem,
  KNOWLEDGE_STATES,
  understandBusinessContext,
} from '../index.js';

async function confirmFromText(text, opts = {}) {
  const first = await understandBusinessContext(
    { text, modeHint: opts.modeHint ?? null, websiteHint: opts.websiteHint ?? null },
    {
      resolveBusinessEntity:
        opts.resolveBusinessEntity ||
        (async () => ({
          candidates: [],
          confidence: 0,
          requiresOwnerConfirmation: true,
          resolutionNotes: [],
        })),
      classifyBusiness:
        opts.classifyBusiness ||
        (async () => ({
          verticalSlug: 'services.general',
          verticalGroup: 'services',
          confidence: 0.85,
          businessDescriptionShort: 'Services',
          keywords: ['services'],
        })),
    },
  );
  let ctx = first.context;
  if (first.nextStep === 'clarify_mode' && opts.modeHint) {
    const again = await understandBusinessContext(
      { text, modeHint: opts.modeHint, websiteHint: opts.websiteHint },
      {
        resolveBusinessEntity: opts.resolveBusinessEntity,
        classifyBusiness: opts.classifyBusiness,
      },
    );
    ctx = again.context;
  }
  if (opts.adjustments) {
    const adj = adjustBusinessContext(ctx, opts.adjustments);
    ctx = adj.context;
  }
  if (opts.continueDescription) {
    const cont = continueWithDescription(ctx);
    ctx = cont.context;
  }
  const confirmed = confirmBusinessContext(ctx);
  expect(confirmed.ok).toBe(true);
  return confirmed.context;
}

describe('Phase B snapshot acceptance', () => {
  it('A. Resolved existing with usable website — offerings from probe, no invention', async () => {
    const html = `
      <html><head><meta name="description" content="Doors and security for Melbourne homes."/></head>
      <body>
        <a href="https://facebook.com/modernsecurity">Facebook</a>
        <ul>
          <li>Security Screen Door $890</li>
          <li>Pet Door Insert $220</li>
        </ul>
      </body></html>`;

    const ctx = await confirmFromText('I run Modern Security Doors in Melbourne', {
      modeHint: 'EXISTING',
      adjustments: {
        name: 'Modern Security Doors',
        website: 'https://example-doors.test',
        location: 'Melbourne',
      },
      resolveBusinessEntity: async () => ({
        candidates: [
          {
            entityId: 'e1',
            name: 'Modern Security Doors',
            website: 'https://example-doors.test',
            location: 'Melbourne',
            confidence: 0.9,
            matchReasons: ['places'],
            source: 'places',
          },
        ],
        selectedCandidate: {
          entityId: 'e1',
          name: 'Modern Security Doors',
          website: 'https://example-doors.test',
          location: 'Melbourne',
          confidence: 0.9,
          source: 'places',
        },
        confidence: 0.9,
        requiresOwnerConfirmation: false,
        resolutionNotes: [],
      }),
    });

    const result = await buildBusinessSnapshot(
      { context: ctx },
      {
        probeWebsiteForSnapshot: async () => ({
          ok: true,
          websiteReachable: true,
          websiteUrl: 'https://example-doors.test',
          ms: 42,
          offerings: [
            {
              name: 'Security Screen Door',
              price: 890,
              knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
              source: 'website_menu_lines',
              confidence: 0.8,
            },
            {
              name: 'Pet Door Insert',
              price: 220,
              knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
              source: 'website_menu_lines',
              confidence: 0.8,
            },
          ],
          social: [
            {
              network: 'facebook',
              url: 'https://facebook.com/modernsecurity',
              knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
              source: 'website_homepage',
            },
          ],
          description: 'Doors and security for Melbourne homes.',
          deepUsed: false,
          deepFailed: null,
        }),
      },
    );

    expect(result.ok).toBe(true);
    expect(result.snapshot.mode).toBe('EXISTING');
    expect(result.snapshot.offerings.count).toBe(2);
    expect(result.snapshot.offerings.items.every((o) => o.knowledgeState === 'DISCOVERED_FACT')).toBe(
      true,
    );
    expect(result.snapshot.identity.website.value).toBeTruthy();
    expect(result.snapshot.observations.some((o) => o.kind === 'FACT')).toBe(true);
    expect(result.snapshot.observations.some((o) => o.kind === 'INTERPRETATION')).toBe(true);
    // Quality gate: no fabricated filler offering
    expect(result.snapshot.offerings.items.some((o) => /lorem|sample|placeholder/i.test(o.name))).toBe(
      false,
    );
    void html;
  });

  it('B. Existing business with no website', async () => {
    const ctx = await confirmFromText('I run ABC Plumbing in Melbourne', {
      modeHint: 'EXISTING',
      adjustments: { name: 'ABC Plumbing', location: 'Melbourne', website: '' },
    });
    // Clear website knowledge
    ctx.identity.website = null;
    ctx.knowledge = ctx.knowledge.filter((k) => k.field !== 'website');

    const result = await buildBusinessSnapshot({ context: ctx });
    expect(result.ok).toBe(true);
    expect(result.snapshot.failures.some((f) => f.code === 'website_not_found')).toBe(true);
    expect(result.snapshot.offerings.status).toBe('unavailable');
    expect(result.snapshot.offerings.items).toHaveLength(0);
    expect(result.snapshot.digitalPresence.message).toMatch(/couldn't verify a website/i);
  });

  it('C. Website but no usable offering catalog', async () => {
    const ctx = await confirmFromText('I run Quiet Cafe Melbourne', {
      modeHint: 'EXISTING',
      adjustments: { website: 'https://quiet-cafe.test', name: 'Quiet Cafe' },
    });
    const result = await buildBusinessSnapshot(
      { context: ctx },
      {
        probeWebsiteForSnapshot: async () => ({
          ok: true,
          websiteReachable: true,
          websiteUrl: 'https://quiet-cafe.test',
          ms: 30,
          offerings: [],
          social: [],
          description: null,
          deepUsed: false,
          deepFailed: null,
        }),
      },
    );
    expect(result.snapshot.offerings.status).toBe('absent');
    expect(result.snapshot.offerings.items).toHaveLength(0);
    expect(result.snapshot.failures.some((f) => f.code === 'offering_evidence_absent')).toBe(true);
  });

  it('D. Unresolved existing continued by description', async () => {
    const ctx = await confirmFromText('I run Unique Widget Co in Perth', {
      modeHint: 'EXISTING',
      continueDescription: true,
    });
    const result = await buildBusinessSnapshot({ context: ctx });
    expect(result.ok).toBe(true);
    expect(result.snapshot.mode).toBe('EXISTING');
    expect(result.snapshot.failures.some((f) => f.code === 'business_unresolved' || f.code === 'website_not_found')).toBe(
      true,
    );
  });

  it('E. Intended local service business', async () => {
    const ctx = await confirmFromText(
      'I want to start a mobile car detailing business in Melbourne.',
    );
    const result = await buildBusinessSnapshot({ context: ctx });
    expect(result.ok).toBe(true);
    expect(result.snapshot.mode).toBe('INTENDED');
    expect(result.snapshot.offerings.status).toBe('not_applicable');
    expect(result.snapshot.digitalPresence.status).toBe('not_applicable');
    expect(result.snapshot.assumptions.some((a) => a.key === 'location')).toBe(true);
    expect(result.snapshot.informationGaps.length).toBeGreaterThanOrEqual(2);
    // K: no existing-business operating facts invented
    expect(result.snapshot.offerings.items).toHaveLength(0);
    expect(result.snapshot.digitalPresence.social || []).toHaveLength(0);
  });

  it('F. Intended product/manufacturing business', async () => {
    const ctx = await confirmFromText(
      "I'm planning a custom packaging company in Ho Chi Minh City",
    );
    const result = await buildBusinessSnapshot({ context: ctx });
    expect(result.snapshot.mode).toBe('INTENDED');
    expect(result.snapshot.identity.location.value).toMatch(/Ho Chi Minh/i);
    expect(result.ui.ctas.some((c) => c.id === 'create')).toBe(true);
  });

  it('G. User-corrected context preserved in snapshot', async () => {
    const ctx = await confirmFromText('I want to start a cafe in Sydney', {
      adjustments: { businessType: 'Specialty Coffee Bar', location: 'Surry Hills' },
    });
    const result = await buildBusinessSnapshot({ context: ctx });
    expect(result.snapshot.identity.businessType.value).toBe('Specialty Coffee Bar');
    expect(
      result.snapshot.evidence.some(
        (e) =>
          e.field === 'businessType' &&
          e.knowledgeState === KNOWLEDGE_STATES.USER_DEFINED &&
          e.value === 'Specialty Coffee Bar',
      ),
    ).toBe(true);
  });

  it('H. Research provider failure — honest failure state', async () => {
    const ctx = await confirmFromText('I run Door Co Melbourne', {
      modeHint: 'EXISTING',
      adjustments: { website: 'https://door-co.test', name: 'Door Co' },
    });
    const result = await buildBusinessSnapshot(
      { context: ctx },
      {
        probeWebsiteForSnapshot: async () => ({
          ok: false,
          reason: 'website_fetch_failed',
          message: "We couldn't verify a website yet.",
          ms: 12,
          offerings: [],
          social: [],
          description: null,
          websiteReachable: false,
        }),
      },
    );
    expect(result.snapshot.failures.some((f) => f.code === 'website_fetch_failed')).toBe(true);
    expect(result.snapshot.offerings.items).toHaveLength(0);
  });

  it('I. Partial evidence / timeout on deep offerings', async () => {
    const ctx = await confirmFromText('I run Partial Co Melbourne', {
      modeHint: 'EXISTING',
      adjustments: { website: 'https://partial.test', name: 'Partial Co' },
    });
    const result = await buildBusinessSnapshot(
      { context: ctx },
      {
        probeWebsiteForSnapshot: async () => ({
          ok: true,
          websiteReachable: true,
          websiteUrl: 'https://partial.test',
          ms: 100,
          offerings: [],
          social: [],
          description: 'Hello',
          deepUsed: false,
          deepFailed: 'timeout',
        }),
      },
    );
    expect(result.snapshot.failures.some((f) => f.code === 'timeout')).toBe(true);
    expect(result.snapshot.offerings.status).toBe('absent');
  });

  it('J. FALSE OFFERING RATE = 0 — empty probe never invents offerings', async () => {
    const ctx = await confirmFromText('I run Empty Catalog Co', {
      modeHint: 'EXISTING',
      adjustments: { website: 'https://empty.test', name: 'Empty Catalog Co' },
    });
    const result = await buildBusinessSnapshot(
      { context: ctx },
      {
        probeWebsiteForSnapshot: async () => ({
          ok: true,
          websiteReachable: true,
          websiteUrl: 'https://empty.test',
          ms: 5,
          offerings: [],
          social: [],
          description: null,
          deepUsed: false,
          deepFailed: null,
        }),
      },
    );
    expect(result.snapshot.offerings.items).toEqual([]);
    expect(result.snapshot.offerings.count).toBe(0);
  });

  it('K. INTENDED never gets invented website / listings', async () => {
    let ctx = await confirmFromText('I want to create an AI accounting service for Australian SMEs');
    // Attempt to pollute with discovery-like knowledge should be cleared for website unless USER_DEFINED
    ctx = {
      ...ctx,
      knowledge: [
        ...ctx.knowledge,
        createKnowledgeItem({
          field: 'website',
          value: 'https://invented.example',
          knowledgeState: KNOWLEDGE_STATES.DISCOVERED_FACT,
          source: 'places',
        }),
      ],
      identity: { ...ctx.identity, website: 'https://invented.example' },
    };
    // Re-confirm after pollution
    const confirmed = confirmBusinessContext(ctx);
    const result = await buildBusinessSnapshot({ context: confirmed.context });
    expect(result.snapshot.mode).toBe('INTENDED');
    expect(result.snapshot.identity.website.value).toBeNull();
    expect(result.snapshot.digitalPresence.listing).toBeNull();
  });

  it('L. Knowledge states preserved on evidence', async () => {
    const ctx = await confirmFromText('I want to start a mobile detailing business in Melbourne');
    const result = await buildBusinessSnapshot({ context: ctx });
    expect(result.snapshot.evidence.length).toBeGreaterThan(0);
    expect(
      result.snapshot.evidence.every((e) =>
        ['USER_DEFINED', 'DISCOVERED_FACT', 'AI_INFERENCE', 'ASSUMPTION'].includes(e.knowledgeState),
      ),
    ).toBe(true);
  });

  it('M. Attribution event constants exist (minimal extension)', async () => {
    const { CANONICAL_EVENTS } = await import('../../../services/marketingOperations/constants.js');
    expect(CANONICAL_EVENTS.BUSINESS_ANALYSIS_STARTED).toBe('BUSINESS_ANALYSIS_STARTED');
    expect(CANONICAL_EVENTS.BUSINESS_CONTEXT_CONFIRMED).toBe('BUSINESS_CONTEXT_CONFIRMED');
    expect(CANONICAL_EVENTS.BUSINESS_SNAPSHOT_COMPLETED).toBe('BUSINESS_SNAPSHOT_COMPLETED');
    expect(CANONICAL_EVENTS.BUSINESS_SNAPSHOT_VIEWED).toBe('BUSINESS_SNAPSHOT_VIEWED');
  });

  it('N. Anonymous snapshot permitted without auth (contract only requires confirmed context)', async () => {
    const ctx = createEmptyBusinessContext({
      sourceText: 'I want to start a bakery in Richmond',
      mode: 'INTENDED',
      status: 'CONFIRMED',
      confirmation: {
        confirmed: true,
        confirmedAt: new Date().toISOString(),
        confirmedBy: 'user',
        summary: 'test',
      },
      knowledge: [
        createKnowledgeItem({
          field: 'mode',
          value: 'INTENDED',
          knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
          source: 'test',
        }),
        createKnowledgeItem({
          field: 'location',
          value: 'Richmond',
          knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
          source: 'test',
        }),
        createKnowledgeItem({
          field: 'businessType',
          value: 'Bakery',
          knowledgeState: KNOWLEDGE_STATES.USER_DEFINED,
          source: 'test',
        }),
      ],
      identity: {
        name: 'Bakery',
        businessType: 'Bakery',
        location: 'Richmond',
        category: null,
        website: null,
        operatingModel: null,
      },
    });
    const result = await buildBusinessSnapshot({ context: ctx });
    expect(result.ok).toBe(true);
    expect(result.snapshot.mode).toBe('INTENDED');
  });

  it('Rejects unconfirmed context', async () => {
    const draft = createEmptyBusinessContext({
      sourceText: 'test',
      mode: 'EXISTING',
      status: 'AWAITING_CONFIRMATION',
    });
    const result = await buildBusinessSnapshot({ context: draft });
    expect(result.ok).toBe(false);
    expect(result.error).toBe('context_not_confirmed');
  });
});
