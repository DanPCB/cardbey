import { describe, expect, it } from 'vitest';
import { attemptIntentRecovery, mergeRecoveredClassification } from '../intakeIntentRecovery.js';
import { resolveIntent } from '../intakeIntentResolver.js';
import { getToolEntry } from '../intakeToolRegistry.js';
import { validateIntakeClassification } from '../intakeContractValidate.js';

describe('attemptIntentRecovery', () => {
  it('maps sale / percent target phrasing to create_offer', () => {
    const r = attemptIntentRecovery({
      userMessage: 'set sale target 10%',
      classification: { tool: 'general_chat', confidence: 0.2, parameters: {}, executionPath: 'chat' },
    });
    expect(r.recovered).toBe(true);
    expect(r.tool).toBe('create_offer');
    expect(r.parameters?.campaignContext).toMatch(/10%/);
  });

  it('maps headline / text fix phrasing to code_fix', () => {
    const r = attemptIntentRecovery({
      userMessage: 'fix the headline on my homepage',
      classification: { tool: 'general_chat', confidence: 0.3, parameters: {}, executionPath: 'chat' },
    });
    expect(r.recovered).toBe(true);
    expect(r.tool).toBe('code_fix');
    expect(r.parameters?.description).toContain('headline');
  });
});

describe('attemptIntentRecovery + history', () => {
  it('hero follow-up recovers with conversationHistory', () => {
    const rec = attemptIntentRecovery({
      userMessage: 'not a food photo, use fashion',
      classification: { tool: 'general_chat', confidence: 0.2, executionPath: 'chat', parameters: {} },
      storeId: 's1',
      conversationHistory: [{ role: 'user', content: 'change hero image' }],
    });
    expect(rec.recovered).toBe(true);
    expect(rec.tool).toBe('improve_hero');
    expect(rec.resolution?.subtype).toBe('change_hero_image');
  });
});

describe('mergeRecoveredClassification', () => {
  it('preserves _intentResolution from resolver', () => {
    const base = {
      tool: 'general_chat',
      executionPath: 'chat',
      confidence: 0.2,
      parameters: {},
    };
    const resolution = resolveIntent({
      userMessage: 'change banner image',
      classification: base,
      storeId: 's1',
    });
    const merged = mergeRecoveredClassification(base, {
      recovered: true,
      tool: resolution.chosenTool,
      parameters: resolution.extractedParameters,
      recoveryReason: resolution.resolverReason,
      resolution,
    });
    expect(merged._intentResolution?.subtype).toBe('change_hero_image');
    expect(merged._intentResolution?.family).toBe('website_edit');
  });

  it('after resolver recovery, contract validation still runs (e.g. requires_store)', () => {
    const base = {
      tool: 'general_chat',
      executionPath: 'chat',
      confidence: 0.2,
      parameters: {},
    };
    const rec = attemptIntentRecovery({
      userMessage: '10% discount on everything',
      classification: base,
    });
    expect(rec.recovered).toBe(true);
    const merged = mergeRecoveredClassification(base, rec);
    const v = validateIntakeClassification(merged, null);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.reason === 'requires_store')).toBe(true);
  });

  it('overrides tool, path, and boosts confidence', () => {
    const base = {
      tool: 'general_chat',
      executionPath: 'chat',
      confidence: 0.2,
      parameters: {},
    };
    const merged = mergeRecoveredClassification(base, {
      recovered: true,
      tool: 'code_fix',
      parameters: { description: 'fix hero' },
      recoveryReason: 'test',
    });
    expect(merged.tool).toBe('code_fix');
    expect(merged.executionPath).toBe(getToolEntry('code_fix')?.executionPath);
    expect(merged.confidence).toBeGreaterThanOrEqual(0.8);
    expect(merged.parameters.description).toBe('fix hero');
  });
});
