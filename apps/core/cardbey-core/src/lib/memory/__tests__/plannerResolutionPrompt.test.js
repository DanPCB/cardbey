import { describe, expect, it } from 'vitest';
import { buildResolutionAskFromErrors } from '../plannerResolutionPrompt.js';

describe('plannerResolutionPrompt', () => {
  it('AMBIGUOUS lists candidates', () => {
    const ask = buildResolutionAskFromErrors([
      {
        entityType: 'store',
        ref: 'my cafe',
        reason: 'AMBIGUOUS',
        candidates: [
          { id: 's1', name: 'Cafe A' },
          { id: 's2', name: 'Cafe B' },
        ],
      },
    ]);
    expect(ask?.prompt).toContain('Cafe A');
    expect(ask?.prompt).toContain('Cafe B');
    expect(ask?.missing).toContain('storeId');
  });

  it('PRONOUN_UNRESOLVABLE asks which entity', () => {
    const ask = buildResolutionAskFromErrors([
      { entityType: 'store', ref: 'it', reason: 'PRONOUN_UNRESOLVABLE' },
    ]);
    expect(ask?.prompt.toLowerCase()).toContain('which store');
  });

  it('NOT_FOUND mentions search ref', () => {
    const ask = buildResolutionAskFromErrors([
      { entityType: 'product', ref: 'Mystery Item', reason: 'NOT_FOUND' },
    ]);
    expect(ask?.prompt).toContain('Mystery Item');
  });
});
