import { describe, expect, it } from 'vitest';
import { resolveIntent, mergeIntentResolutionIntoClassification } from '../intakeIntentResolver.js';
import { extractPercentValue, extractTextReplacement } from '../intakeIntentExtractors.js';
import { mergeClarifyOptionsFromResolution } from '../intakeClarifyOptions.js';

describe('resolveIntent — ontology', () => {
  it('sale / discount + percent → promotion_campaign / set_discount + create_offer', () => {
    const r = resolveIntent({
      userMessage: 'set sale target 10%',
      classification: { tool: 'general_chat', confidence: 0.2, executionPath: 'chat', parameters: {} },
      storeId: 's1',
    });
    expect(r.family).toBe('promotion_campaign');
    expect(r.subtype).toBe('set_discount');
    expect(r.candidateTools).toContain('create_offer');
    expect(r.chosenTool).toBe('create_offer');
    expect(r.recovered).toBe(true);
  });

  it('headline / text fix → content_edit / change_headline + code_fix', () => {
    const r = resolveIntent({
      userMessage: 'fix the headline to MIMI WEB',
      classification: { tool: 'general_chat', confidence: 0.2, executionPath: 'chat', parameters: {} },
      storeId: 's1',
    });
    expect(r.family).toBe('content_edit');
    expect(r.subtype).toBe('change_headline');
    expect(r.chosenTool).toBe('code_fix');
    expect(r.recovered).toBe(true);
  });

  it('improve my store → store_improvement / improve_store_general', () => {
    const r = resolveIntent({
      userMessage: 'improve my store',
      classification: { tool: 'general_chat', confidence: 0.2, executionPath: 'chat', parameters: {} },
      storeId: 's1',
    });
    expect(r.family).toBe('store_improvement');
    expect(r.subtype).toBe('improve_store_general');
    expect(r.chosenTool).toBe('analyze_store');
    expect(r.recovered).toBe(true);
  });

  it('strong classifier does not set recovered', () => {
    const r = resolveIntent({
      userMessage: 'anything',
      classification: {
        tool: 'orders_report',
        confidence: 0.95,
        executionPath: 'direct_action',
        parameters: { groupBy: 'day' },
      },
      storeId: 's1',
    });
    expect(r.recovered).toBe(false);
    expect(r.chosenTool).toBe('orders_report');
    expect(r.resolverReason).toBe('classifier_strong');
  });
});

describe('mergeIntentResolutionIntoClassification', () => {
  it('merges chosen tool and parameters for validation downstream', () => {
    const base = { tool: 'general_chat', executionPath: 'chat', confidence: 0.2, parameters: {} };
    const r = resolveIntent({
      userMessage: 'show sales',
      classification: base,
      storeId: 's1',
    });
    const merged = mergeIntentResolutionIntoClassification(base, r);
    expect(merged.tool).toBe('orders_report');
    expect(merged.executionPath).toBe('direct_action');
  });
});

describe('intakeIntentExtractors', () => {
  it('extractPercentValue', () => {
    expect(extractPercentValue('set target 10%')).toEqual({ value: '10%' });
    expect(extractPercentValue('no percent')).toBeNull();
  });

  it('extractTextReplacement', () => {
    const x = extractTextReplacement('fix headline to MIMI WEB');
    expect(x?.field).toBe('headline');
    expect(x?.value).toBe('MIMI WEB');
  });
});

describe('mergeClarifyOptionsFromResolution', () => {
  it('never uses generic "Something else" label', () => {
    const r = resolveIntent({
      userMessage: 'maybe something vague',
      classification: { tool: 'general_chat', confidence: 0.1, executionPath: 'clarify', parameters: {} },
      storeId: null,
    });
    const opts = mergeClarifyOptionsFromResolution(r, 'maybe something vague', 'en', []);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts.every((o) => !/^something else$/i.test(String(o.label).trim()))).toBe(true);
  });
});

describe('resolveIntent — ambiguous fallback', () => {
  it('unresolved message still exposes registered candidates for safe clarify', () => {
    const r = resolveIntent({
      userMessage: 'maybe something vague xyz',
      classification: { tool: 'general_chat', confidence: 0.05, executionPath: 'clarify', parameters: {} },
      storeId: null,
    });
    expect(r.recovered).toBe(false);
    expect(r.resolverReason).toBe('unresolved');
    expect(r.candidateTools.length).toBeGreaterThan(0);
    expect(r.candidateTools.every((t) => typeof t === 'string' && t.length > 0)).toBe(true);
  });
});
