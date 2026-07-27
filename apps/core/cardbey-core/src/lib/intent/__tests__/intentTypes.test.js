/**
 * @vitest-environment node
 */
import { describe, expect, it } from 'vitest';
import {
  INTENT_REASONER_VERSION,
  INTENT_TYPE_LIST,
  createReasoningResult,
  getConfidenceLevel,
  getIntentDescription,
  getIntentDisplayName,
  isIntentResult,
  isValidIntentType,
  requiresUserIntervention,
} from '../index.js';

describe('intent reasoning types', () => {
  it('exports version and full intent type list', () => {
    expect(INTENT_REASONER_VERSION).toBe('1.0.0');
    expect(INTENT_TYPE_LIST).toContain('add_product');
    expect(INTENT_TYPE_LIST).toContain('guide_to_sign_in');
    expect(INTENT_TYPE_LIST.length).toBeGreaterThanOrEqual(40);
  });

  it('validates intent types and builds reasoning results', () => {
    expect(isValidIntentType('add_product')).toBe(true);
    expect(isValidIntentType('not_an_intent')).toBe(false);

    const result = createReasoningResult('add_product', 0.85, 'ask_clarification', [
      'Guest has draft store',
      'Product details missing',
    ]);

    expect(isIntentResult(result)).toBe(true);
    expect(result.intent).toBe('add_product');
    expect(getIntentDisplayName('add_product')).toBe('Add Product');
    expect(getIntentDescription('add_product')).toContain('product');
    expect(getConfidenceLevel(0.85)).toBe('high');
    expect(requiresUserIntervention(result)).toBe(true);
  });

  it('createReasoningResult applies default metadata', () => {
    const result = createReasoningResult('unknown', 0.2, 'no_action', []);
    expect(result.metadata.version).toBe('1.0.0');
    expect(result.metadata.sources).toEqual(['rules']);
    expect(result.trace).toBeNull();
  });
});
