/**
 * Foundation 2: mergeAgentMemory unit tests.
 */

import { describe, it, expect } from 'vitest';
import { mergeAgentMemory } from './agentMemory.js';

describe('mergeAgentMemory', () => {
  it('returns empty object when patch is null', () => {
    const current = { entities: { products: [{ id: '1', name: 'A' }] } };
    expect(mergeAgentMemory(current, null)).toEqual(current);
  });

  it('returns copy of current when patch is empty object', () => {
    const current = { lastUpdatedBy: 'X' };
    const out = mergeAgentMemory(current, {});
    expect(out).toEqual(current);
    expect(out).not.toBe(current);
  });

  it('null-safe on empty current', () => {
    const patch = { lastUpdatedBy: 'CatalogAgent', lastUpdatedAt: '2025-01-01T00:00:00Z' };
    const out = mergeAgentMemory(null, patch);
    expect(out).toEqual(patch);
  });

  it('null-safe on undefined current', () => {
    const patch = { researchNotes: 'test' };
    expect(mergeAgentMemory(undefined, patch)).toEqual(patch);
  });

  it('scalar overwrite (last-write-wins)', () => {
    const current = { researchNotes: 'old', lastUpdatedBy: 'A' };
    const patch = { researchNotes: 'new' };
    const out = mergeAgentMemory(current, patch);
    expect(out.researchNotes).toBe('new');
    expect(out.lastUpdatedBy).toBe('A');
  });

  it('entities.products merge by id', () => {
    const current = {
      entities: {
        products: [
          { id: '1', name: 'Alpha' },
          { id: '2', name: 'Beta' },
        ],
      },
    };
    const patch = {
      entities: {
        products: [
          { id: '2', name: 'Beta Updated' },
          { id: '3', name: 'Gamma' },
        ],
      },
    };
    const out = mergeAgentMemory(current, patch);
    expect(out.entities.products).toHaveLength(3);
    const byId = Object.fromEntries(out.entities.products.map((p) => [p.id, p]));
    expect(byId['1'].name).toBe('Alpha');
    expect(byId['2'].name).toBe('Beta Updated');
    expect(byId['3'].name).toBe('Gamma');
  });

  it('entities.offers merge by id', () => {
    const current = { entities: { offers: [{ id: 'o1', title: 'Offer 1' }] } };
    const patch = { entities: { offers: [{ id: 'o1', title: 'Offer 1 Updated' }, { id: 'o2', title: 'Offer 2' }] } };
    const out = mergeAgentMemory(current, patch);
    expect(out.entities.offers).toHaveLength(2);
    expect(out.entities.offers.find((o) => o.id === 'o1').title).toBe('Offer 1 Updated');
    expect(out.entities.offers.find((o) => o.id === 'o2').title).toBe('Offer 2');
  });

  it('entities.signals shallow-merge', () => {
    const current = { entities: { signals: { summary: 'old', windowDays: 7 } } };
    const patch = { entities: { signals: { windowDays: 14 } } };
    const out = mergeAgentMemory(current, patch);
    expect(out.entities.signals.summary).toBe('old');
    expect(out.entities.signals.windowDays).toBe(14);
  });

  it('plannerDirectives replaced by array', () => {
    const current = { plannerDirectives: ['a', 'b'] };
    const patch = { plannerDirectives: ['c'] };
    const out = mergeAgentMemory(current, patch);
    expect(out.plannerDirectives).toEqual(['c']);
  });

  it('ignores undefined patch values', () => {
    const current = { lastUpdatedBy: 'X' };
    const out = mergeAgentMemory(current, { lastUpdatedBy: undefined });
    expect(out.lastUpdatedBy).toBe('X');
  });
});
