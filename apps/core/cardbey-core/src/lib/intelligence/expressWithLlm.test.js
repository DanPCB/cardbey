import { describe, expect, it } from 'vitest';
import { validateExpressionResponseForTest } from './expressWithLlm.js';

describe('expressWithLlm keyFacts validation', () => {
  const input = {
    suggestions: [
      { id: 'suggestion_1_ask_performer', label: 'Ask Performer' },
      { id: 'suggestion_2_improve_store', label: 'Improve store' },
    ],
    assessment: {
      facts: [{ label: 'Store Health', value: 33 }],
      issues: [],
    },
    context: { actor: { role: 'store_owner' } },
  };

  it('accepts "Label: value" keyFacts such as "Store Health: 33"', () => {
    const result = validateExpressionResponseForTest(
      {
        title: 'Your store at a glance',
        message: 'A few quick wins are available.',
        primarySuggestionId: 'suggestion_1_ask_performer',
        secondarySuggestionIds: [],
        keyFacts: ['Store Health: 33'],
      },
      input,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('accepts exact assessment fact labels', () => {
    const result = validateExpressionResponseForTest(
      {
        title: 'Your store at a glance',
        message: 'A few quick wins are available.',
        primarySuggestionId: 'suggestion_1_ask_performer',
        secondarySuggestionIds: [],
        keyFacts: ['Store Health'],
      },
      input,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('rejects keyFacts that do not match assessment facts', () => {
    const result = validateExpressionResponseForTest(
      {
        title: 'Your store at a glance',
        message: 'A few quick wins are available.',
        primarySuggestionId: 'suggestion_1_ask_performer',
        secondarySuggestionIds: [],
        keyFacts: ['Mystery Metric: 99'],
      },
      input,
    );

    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('keyFact not in assessment'))).toBe(true);
  });
});
