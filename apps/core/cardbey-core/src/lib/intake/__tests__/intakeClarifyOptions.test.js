import { describe, expect, it } from 'vitest';
import { buildContextualClarifyOptions, mergeClarifyOptionsFromResolution } from '../intakeClarifyOptions.js';
import { resolveIntent } from '../intakeIntentResolver.js';

describe('buildContextualClarifyOptions', () => {
  it('does not emit generic "Something else" labels', () => {
    const opts = buildContextualClarifyOptions({
      userMessage: 'set sale target 10%',
      locale: 'en',
      seedTools: [],
    });
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts.every((o) => !/^something else$/i.test(String(o.label).trim()))).toBe(true);
  });

  it('prefers offer- and report-related options for sale + percent input', () => {
    const opts = buildContextualClarifyOptions({
      userMessage: 'set sale target 10%',
      locale: 'en',
      seedTools: [],
    });
    const tools = opts.map((o) => o.tool);
    expect(tools.includes('create_offer') || tools.includes('create_promotion')).toBe(true);
  });
});

describe('mergeClarifyOptionsFromResolution', () => {
  it('first options align with resolver candidate tools for promotion intent', () => {
    const ir = resolveIntent({
      userMessage: 'set sale target 10%',
      classification: { tool: 'general_chat', confidence: 0.1, executionPath: 'clarify', parameters: {} },
      storeId: 's1',
    });
    const opts = mergeClarifyOptionsFromResolution(ir, 'set sale target 10%', 'en', [], 3);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    const fromCandidates = ir.candidateTools.slice(0, opts.length);
    expect(opts.slice(0, fromCandidates.length).every((o) => ir.candidateTools.includes(o.tool))).toBe(true);
  });
});
