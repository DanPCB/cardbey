import { describe, expect, it } from 'vitest';
import { assertTransition } from '../listing/listingStateMachine.js';

describe('marketplace listingStateMachine', () => {
  it('allows creator draft submission', () => {
    expect(assertTransition('DRAFT', 'SUBMITTED', 'creator')).toBe(true);
  });

  it('blocks creator publish transition', () => {
    expect(() => assertTransition('APPROVED', 'PUBLISHED', 'creator')).toThrow(/not allowed/i);
  });

  it('allows system re-review after publish', () => {
    expect(assertTransition('PUBLISHED', 'SUBMITTED', 'system')).toBe(true);
  });
});
