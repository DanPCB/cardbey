import { describe, it, expect, beforeEach } from 'vitest';
import { buildCanonicalIntent } from '../intentEngine.js';
import { planSearchFromIntent } from '../queryPlanner.js';
import { listSourceNodes, federationHealth } from '../sourceFederation.js';
import { suggestRights, decideRights } from '../rightsIntelligence.js';
import { buildReusePlan, confirmReusePlan } from '../reusePlanner.js';
import { listAiProviders, invokeAiModality } from '../aiProviderRegistry.js';
import { AI_MODALITY } from '../types.js';
import { resetResourceIndexForTests, upsertResourceRecord } from '../resourceIndex.js';

describe('URI Phase 1 foundation', () => {
  beforeEach(() => {
    resetResourceIndexForTests();
  });

  it('builds canonical intent from utterance', async () => {
    const res = await buildCanonicalIntent({
      utterance: 'Need a relaxing café background for a digital display',
    });
    expect(res.ok).toBe(true);
    expect(res.intent.industry).toBe('food-drink');
    expect(res.intent.channel).toBe('display');
    expect(res.intent.authority).toBe('intent_engine');
  });

  it('plans across federation without hardcoding a single provider', async () => {
    const { intent } = await buildCanonicalIntent({
      utterance: 'café display background',
    });
    const plan = await planSearchFromIntent(intent);
    expect(plan.ok).toBe(true);
    expect(plan.searchPlan.steps.length).toBeGreaterThan(1);
    const sourceIds = plan.searchPlan.steps.map((s) => s.sourceId);
    expect(sourceIds).toContain('src_cardbey_library');
    expect(plan.searchPlan.policies.download).toBe(false);
    expect(plan.searchPlan.policies.publish).toBe(false);
  });

  it('registers global source federation nodes', () => {
    const health = federationHealth();
    expect(health.total).toBeGreaterThanOrEqual(5);
    expect(listSourceNodes({ status: 'ACTIVE' }).length).toBeGreaterThan(0);
  });

  it('keeps AI rights suggestions non-authoritative', () => {
    const suggestion = suggestRights({ sourceId: 'src_pexels', license: 'Pexels License' });
    const decision = decideRights(suggestion);
    expect(suggestion.suggestion).toBe('SUGGESTED');
    expect(decision.decision).toBe('NEEDS_REVIEW');
    expect(decision.publicationAllowed).toBe(false);
  });

  it('reuse plan requires confirmation and does not auto-host', async () => {
    const rec = upsertResourceRecord({
      sourceId: 'src_pexels',
      remoteId: '1',
      title: 'Cafe',
      mediaType: 'image',
      technical: { hostingMode: 'REFERENCE' },
    });
    const plan = await buildReusePlan({ resourceIds: [rec.id] });
    expect(plan.ok).toBe(true);
    expect(plan.reusePlan.policies.host).toBe(false);
    const denied = confirmReusePlan(plan.reusePlan, { confirm: false });
    expect(denied.ok).toBe(false);
    const ok = confirmReusePlan(plan.reusePlan, { confirm: true });
    expect(ok.ok).toBe(true);
    expect(ok.reusePlan.execution.phase).toBe('2_reuse_pilot');
  });

  it('exposes modality AI registry without vendor coupling in URI', async () => {
    const providers = listAiProviders();
    expect(providers.some((p) => p.modality === AI_MODALITY.TEXT)).toBe(true);
    const out = await invokeAiModality(AI_MODALITY.CLASSIFICATION, {
      text: 'beauty salon template',
    });
    expect(out.ok).toBe(true);
  });
});
