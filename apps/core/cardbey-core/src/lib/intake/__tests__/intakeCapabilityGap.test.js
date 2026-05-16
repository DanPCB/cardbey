import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { detectCapabilityGap, isIntakeV2CapabilityGapEnabled } from '../intakeCapabilityGap.js';
import { buildCapabilityProposalFromGap } from '../intakeCapabilityProposal.js';

describe('intakeCapabilityGap', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled when DISABLE_INTAKE_V2_CAPABILITY_GAP=true', async () => {
    vi.stubEnv('DISABLE_INTAKE_V2_CAPABILITY_GAP', 'true');
    expect(isIntakeV2CapabilityGapEnabled()).toBe(false);
    const r = await detectCapabilityGap({
      userMessage: 'Please add a completely new testimonials block under the hero on my mini website',
      classification: { tool: 'general_chat', executionPath: 'chat' },
      validationErrors: [],
      intentResolution: { confidence: 0.9 },
    });
    expect(r.isGap).toBe(false);
  });

  it('does not trigger for simple headline fix (code_fix territory)', async () => {
    vi.stubEnv('DISABLE_INTAKE_V2_CAPABILITY_GAP', '');
    const r = await detectCapabilityGap({
      userMessage: 'change the headline on my store to Summer Sale',
      classification: { tool: 'general_chat', executionPath: 'chat' },
      validationErrors: [],
      intentResolution: { confidence: 0.9 },
    });
    expect(r.isGap).toBe(false);
  });

  it('does not trigger for code_fix classification', async () => {
    const r = await detectCapabilityGap({
      userMessage: 'add a new ui section for testimonials under the hero headline with rotating quotes',
      classification: { tool: 'code_fix', executionPath: 'direct_action' },
      validationErrors: [],
      intentResolution: { confidence: 0.9 },
    });
    expect(r.isGap).toBe(false);
  });

  it('triggers for tagline-under-hero placement with sufficient confidence', async () => {
    const msg =
      'write some tagline under the store headline that explains we are a sustainable fashion brand';
    const r = await detectCapabilityGap({
      userMessage: msg,
      classification: { tool: 'general_chat', executionPath: 'chat' },
      validationErrors: [],
      intentResolution: { confidence: 0.72, family: 'website', subtype: 'content' },
    });
    expect(r.isGap).toBe(true);
    expect(r.suggestedScope).toBe('content_field');
    expect(r.spawnIntent).toMatch(/proposal-only/i);
  });

  it('triggers for new UI block request', async () => {
    const msg =
      'add a new testimonials section block below the hero on my mini website with customer quotes';
    const r = await detectCapabilityGap({
      userMessage: msg,
      classification: { tool: 'general_chat', executionPath: 'chat' },
      validationErrors: [],
      intentResolution: { confidence: 0.8 },
    });
    expect(r.isGap).toBe(true);
    expect(r.suggestedScope).toBe('ui_element');
  });

  it('triggers on unknown_field validation when message suggests extension', async () => {
    const r = await detectCapabilityGap({
      userMessage: 'Please add a custom loyaltyPoints field to my storefront editor and sync it to preview',
      classification: { tool: 'orders_report', executionPath: 'direct_action' },
      validationErrors: [{ field: 'loyaltyPoints', reason: 'unknown_field' }],
      intentResolution: { confidence: 0.6 },
    });
    expect(r.isGap).toBe(true);
    expect(r.suggestedScope).toBe('editor_support');
  });
});

describe('buildCapabilityProposalFromGap', () => {
  it('returns normalized proposal shape', () => {
    const gap = {
      isGap: true,
      reason: 'test',
      requestedCapability: 'Add tagline under hero',
      suggestedScope: 'content_field',
      spawnIntent: 'Proposal-only intent',
    };
    const p = buildCapabilityProposalFromGap(gap, 'user text', { family: 'x', subtype: 'y' });
    expect(p.title).toBeTruthy();
    expect(p.summary).toMatch(/proposal-only/i);
    expect(p.requestedCapability).toContain('Add tagline');
    expect(p.proposedImplementation.patchType).toBe('content_field');
    expect(Array.isArray(p.proposedImplementation.affectedAreas)).toBe(true);
    expect(p.proposedImplementation.additiveOnly).toBe(true);
    expect(p.risks.length).toBeGreaterThan(0);
    expect(p.testsNeeded.length).toBeGreaterThan(0);
    expect(p.proposalSource).toBe('template');
  });
});
