import { describe, it, expect } from 'vitest';
import { isBusinessAction, listBusinessActions, BUSINESS_ACTION_REGISTRY } from '../actionRegistry.js';
import { BUSINESS_ACTIONS } from '../constants.js';

describe('business actionRegistry', () => {
  it('lists all declared business actions', () => {
    for (const name of BUSINESS_ACTIONS) {
      expect(BUSINESS_ACTION_REGISTRY[name]).toBeDefined();
      expect(isBusinessAction(name)).toBe(true);
    }
  });

  it('phase 1 actions are marked phase 1', () => {
    const phase1 = listBusinessActions({ phase: 1 }).map((a) => a.name);
    expect(phase1).toContain('create_order');
    expect(phase1).toContain('checkout_order');
    expect(phase1).toContain('receive_inventory');
  });
});
