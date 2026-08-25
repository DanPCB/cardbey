/**
 * Phase A acceptance tests — Business Context understand / confirm.
 * Mocks Places entity resolver; never invents websites or businesses.
 */

import { describe, expect, it, vi } from 'vitest';
import {
  adjustBusinessContext,
  confirmBusinessContext,
  continueWithDescription,
  KNOWLEDGE_STATES,
  parseBusinessInput,
  selectResolutionCandidate,
  understandBusinessContext,
} from '../index.js';

function mockClassify(overrides = {}) {
  return vi.fn(async () => ({
    verticalSlug: 'services.general',
    verticalGroup: 'services',
    confidence: 0.85,
    businessDescriptionShort: 'General services business',
    keywords: ['services'],
    ...overrides,
  }));
}

function placesCandidate(partial) {
  return {
    entityId: partial.entityId || 'ent_1',
    name: partial.name || 'Test Biz',
    website: partial.website ?? null,
    location: partial.location ?? null,
    phone: partial.phone ?? null,
    placeId: partial.placeId ?? null,
    confidence: partial.confidence ?? 0.8,
    matchReasons: partial.matchReasons || ['places'],
    source: 'places',
  };
}

describe('parseBusinessInput — mode + fields', () => {
  it('1. existing named business', () => {
    const p = parseBusinessInput('Modern Security Doors Melbourne');
    expect(p.mode).toBe('EXISTING');
    expect(p.needsModeClarification).toBe(false);
    expect(p.location).toMatch(/Melbourne/i);
    expect(p.name || p.businessType).toBeTruthy();
  });

  it('2. existing business + location', () => {
    const p = parseBusinessInput('ABC Plumbing Melbourne');
    expect(p.mode).toBe('EXISTING');
    expect(p.location).toMatch(/Melbourne/i);
  });

  it('3. existing business described naturally', () => {
    const p = parseBusinessInput(
      'I run a security door manufacturing and installation business in Melbourne',
    );
    expect(p.mode).toBe('EXISTING');
    expect(p.location).toMatch(/Melbourne/i);
    expect(p.operatingModel).toBeTruthy();
  });

  it('4. intended business', () => {
    const p = parseBusinessInput('I want to start a mobile car detailing business');
    expect(p.mode).toBe('INTENDED');
    expect(p.operatingModel).toMatch(/Mobile/i);
  });

  it('5. intended business + target location', () => {
    const p = parseBusinessInput(
      "I'm planning a custom packaging company in Ho Chi Minh City",
    );
    expect(p.mode).toBe('INTENDED');
    expect(p.location).toMatch(/Ho Chi Minh/i);
  });

  it('6. ambiguous mode', () => {
    const p = parseBusinessInput('Vietnamese restaurant in Richmond');
    expect(p.needsModeClarification).toBe(true);
    expect(p.mode).toBeNull();
  });

  it('AI accounting intended', () => {
    const p = parseBusinessInput('I want to create an AI accounting service for Australian SMEs');
    expect(p.mode).toBe('INTENDED');
  });
});

describe('understand + confirm acceptance', () => {
  it('4–5. intended — no Places call; intended copy tone', async () => {
    const resolve = vi.fn();
    const result = await understandBusinessContext(
      { text: 'I want to start a mobile car detailing business in Melbourne.' },
      { resolveBusinessEntity: resolve, classifyBusiness: mockClassify({ verticalGroup: 'auto', verticalSlug: 'auto.detailing' }) },
    );
    expect(resolve).not.toHaveBeenCalled();
    expect(result.nextStep).toBe('confirm');
    expect(result.ui.tone).toBe('intended');
    expect(result.message).toMatch(/want to create/i);
    expect(result.context.mode).toBe('INTENDED');
    expect(result.context.resolution.status).toBe('skipped');
    expect(result.context.identity.website).toBeFalsy();
  });

  it('6. ambiguous mode asks clarification', async () => {
    const result = await understandBusinessContext(
      { text: 'Vietnamese restaurant in Richmond' },
      { resolveBusinessEntity: vi.fn(), classifyBusiness: mockClassify() },
    );
    expect(result.nextStep).toBe('clarify_mode');
    expect(result.clarification.options).toHaveLength(2);
  });

  it('1+7. existing named — ambiguous resolution requires selection', async () => {
    const resolve = vi.fn(async () => ({
      candidates: [
        placesCandidate({ entityId: 'a', name: 'Modern Security Doors', location: 'Melbourne', confidence: 0.8 }),
        placesCandidate({ entityId: 'b', name: 'Modern Security Doors Pty', location: 'Richmond', confidence: 0.78 }),
      ],
      selectedCandidate: undefined,
      confidence: 0.8,
      requiresOwnerConfirmation: true,
      resolutionNotes: ['Multiple plausible'],
    }));

    const result = await understandBusinessContext(
      { text: 'Modern Security Doors Melbourne' },
      { resolveBusinessEntity: resolve, classifyBusiness: mockClassify() },
    );
    expect(resolve).toHaveBeenCalled();
    expect(result.nextStep).toBe('select_candidate');
    expect(result.message).toMatch(/few possible matches/i);
    expect(result.context.resolution.requiresSelection).toBe(true);
  });

  it('8. no Places result — fallbacks, no invented website/business', async () => {
    const resolve = vi.fn(async () => ({
      candidates: [],
      confidence: 0,
      requiresOwnerConfirmation: true,
      resolutionNotes: ['No public entity match'],
    }));
    const result = await understandBusinessContext(
      { text: 'I run a security door manufacturing business in Melbourne' },
      { resolveBusinessEntity: resolve, classifyBusiness: mockClassify() },
    );
    expect(result.nextStep).toBe('unresolved_fallbacks');
    expect(result.ui.fallbacks).toContain('enter_website');
    expect(result.ui.fallbacks).toContain('continue_with_description');
    expect(result.context.identity.website).toBeFalsy();
    // Must not invent a fake Places business
    expect(result.context.resolution.candidates).toHaveLength(0);
  });

  it('11. no invented website on Places miss', async () => {
    const resolve = vi.fn(async () => ({
      candidates: [placesCandidate({ name: 'Only Name', website: null, confidence: 0.9 })],
      selectedCandidate: placesCandidate({ name: 'Only Name', website: null, confidence: 0.9 }),
      confidence: 0.9,
      requiresOwnerConfirmation: false,
      resolutionNotes: [],
    }));
    const result = await understandBusinessContext(
      { text: 'Only Name Melbourne' },
      { resolveBusinessEntity: resolve, classifyBusiness: mockClassify() },
    );
    expect(result.context.identity.website).toBeFalsy();
    const webKnowledge = result.context.knowledge.filter((k) => k.field === 'website');
    expect(webKnowledge.every((k) => k.value)).toBe(true); // empty filter ok
    expect(webKnowledge.length).toBe(0);
  });

  it('9. user correction preserved as USER_DEFINED', async () => {
    const resolve = vi.fn(async () => ({
      candidates: [],
      confidence: 0,
      requiresOwnerConfirmation: true,
      resolutionNotes: [],
    }));
    const first = await understandBusinessContext(
      { text: 'I run ABC Plumbing in Melbourne', modeHint: 'EXISTING' },
      { resolveBusinessEntity: resolve, classifyBusiness: mockClassify() },
    );
    const adjusted = adjustBusinessContext(first.context, {
      name: 'ABC Plumbing Co',
      location: 'Richmond, Victoria',
    });
    expect(adjusted.ok).toBe(true);
    const nameItem = adjusted.context.knowledge.find(
      (k) => k.field === 'name' && k.knowledgeState === KNOWLEDGE_STATES.USER_DEFINED,
    );
    expect(nameItem?.value).toBe('ABC Plumbing Co');
    expect(adjusted.context.identity.name).toBe('ABC Plumbing Co');
    expect(adjusted.context.identity.location).toBe('Richmond, Victoria');
  });

  it('10+13. confirmation + provenance survives', async () => {
    const resolve = vi.fn();
    const first = await understandBusinessContext(
      { text: 'I want to create an AI accounting service for Australian SMEs' },
      { resolveBusinessEntity: resolve, classifyBusiness: mockClassify({ verticalGroup: 'services' }) },
    );
    const knowledgeBefore = first.context.knowledge.map((k) => ({ ...k }));
    const confirmed = confirmBusinessContext(first.context);
    expect(confirmed.ok).toBe(true);
    expect(confirmed.context.status).toBe('CONFIRMED');
    expect(confirmed.context.confirmation.confirmed).toBe(true);
    expect(confirmed.context.knowledge.length).toBeGreaterThanOrEqual(knowledgeBefore.length);
    expect(
      confirmed.context.knowledge.some((k) => k.knowledgeState === KNOWLEDGE_STATES.USER_DEFINED),
    ).toBe(true);
    // Still no invented website
    expect(confirmed.context.identity.website).toBeFalsy();
  });

  it('7. select candidate then confirm', async () => {
    const draft = (
      await understandBusinessContext(
        { text: 'Modern Security Doors Melbourne' },
        {
          resolveBusinessEntity: async () => ({
            candidates: [
              placesCandidate({
                entityId: 'a',
                name: 'Modern Security Doors',
                website: 'https://example-doors.com',
                location: 'Melbourne',
                confidence: 0.81,
              }),
              placesCandidate({
                entityId: 'b',
                name: 'Modern Security Doors Richmond',
                location: 'Richmond',
                confidence: 0.79,
              }),
            ],
            requiresOwnerConfirmation: true,
            confidence: 0.81,
            resolutionNotes: [],
          }),
          classifyBusiness: mockClassify(),
        },
      )
    ).context;

    const selected = selectResolutionCandidate(draft, 'a');
    expect(selected.ok).toBe(true);
    expect(selected.context.identity.website).toBe('https://example-doors.com');
    const websiteFact = selected.context.knowledge.find(
      (k) => k.field === 'website' && k.knowledgeState === KNOWLEDGE_STATES.DISCOVERED_FACT,
    );
    expect(websiteFact).toBeTruthy();

    const confirmed = confirmBusinessContext(selected.context);
    expect(confirmed.ok).toBe(true);
    expect(confirmed.context.identity.website).toBe('https://example-doors.com');
  });

  it('8b. continue with description', async () => {
    const first = await understandBusinessContext(
      { text: 'I run Unique Widget Co in Melbourne', modeHint: 'EXISTING' },
      {
        resolveBusinessEntity: async () => ({
          candidates: [],
          confidence: 0,
          requiresOwnerConfirmation: true,
          resolutionNotes: [],
        }),
        classifyBusiness: mockClassify(),
      },
    );
    const cont = continueWithDescription(first.context);
    expect(cont.ok).toBe(true);
    const confirmed = confirmBusinessContext(cont.context);
    expect(confirmed.ok).toBe(true);
  });

  it('9b. USER_DEFINED not overwritten by weaker adjust race via upsert', async () => {
    const first = await understandBusinessContext(
      { text: 'I want to start a cafe in Sydney' },
      { resolveBusinessEntity: vi.fn(), classifyBusiness: mockClassify({ verticalGroup: 'food' }) },
    );
    const adjusted = adjustBusinessContext(first.context, { businessType: 'Specialty Coffee Bar' });
    // Re-project / confirm must keep user type
    const confirmed = confirmBusinessContext(adjusted.context);
    expect(confirmed.context.identity.businessType).toBe('Specialty Coffee Bar');
    const userType = confirmed.context.knowledge.find(
      (k) => k.field === 'businessType' && k.knowledgeState === KNOWLEDGE_STATES.USER_DEFINED,
    );
    expect(userType?.value).toBe('Specialty Coffee Bar');
  });

  it('12. no invented business on empty Places', async () => {
    const result = await understandBusinessContext(
      { text: 'I run Phantom Biz That Does Not Exist in Perth', modeHint: 'EXISTING' },
      {
        resolveBusinessEntity: async () => ({
          candidates: [],
          confidence: 0,
          requiresOwnerConfirmation: true,
          resolutionNotes: [],
        }),
        classifyBusiness: mockClassify(),
      },
    );
    expect(result.context.resolution.candidates).toEqual([]);
    expect(result.context.resolution.status).toBe('unresolved');
  });
});
